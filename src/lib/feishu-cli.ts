import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { recordExecutionLog } from "./activity-log";
import { appConfig } from "./config";
import { concurrencyConfig, mapWithConcurrency, runWithConcurrencyPool } from "./concurrency";
import { ensureFeishuCliIdentity } from "./feishu-cli-identity";
import { isProxyableRemoteMediaUrl } from "./media-request";
import { materializeRuntimeMedia } from "./runtime-media-materializer";
import type { FeishuPostPublishState, FeishuPublishJobSource, GeneratedPost } from "./types";

const execFileAsync = promisify(execFile);

export const feishuRecordBatchSize = 50;

type CliInvocation = {
  file: string;
  argsPrefix: string[];
};

type FeishuCliRunOptions = {
  timeout: number;
  maxBuffer: number;
  env: NodeJS.ProcessEnv;
};

type FeishuNotificationResult = {
  status: "sent" | "skipped" | "failed";
  recipientType?: "chat" | "user";
  message: string;
  stdout?: string;
  stderr?: string;
};

type PreparedAttachmentSet = {
  files: string[];
  cleanup: () => Promise<void>;
};

type PreparedAttachmentFiles = Map<string, PreparedAttachmentSet>;

type FeishuAttachmentUpload = {
  postId: string;
  recordId: string;
  fileCount: number;
  status: "uploaded" | "skipped";
  stdout: string;
  stderr: string;
};

type FeishuAttachmentFailure = {
  postId: string;
  recordId: string;
  fileCount: number;
  error: string;
  stdout?: string;
  stderr?: string;
};

type FeishuRecordMapping = {
  postId: string;
  recordId: string;
  created: boolean;
};

type FeishuPostStateUpdate = {
  postId: string;
  feishu: FeishuPostPublishState;
};

type FeishuPublishNotificationContext = {
  jobId?: string;
  source?: FeishuPublishJobSource;
  sourceRunId?: string;
  ownerUserId?: string;
  ownerDisplayName?: string;
};

type FeishuPublishNotificationSummary = FeishuPublishNotificationContext & {
  status: "published" | "attachment_failed";
  recordMappings: FeishuRecordMapping[];
  attachmentFailureCount: number;
};

type PublishPostsToFeishuOptions = {
  notificationContext?: FeishuPublishNotificationContext;
};

const maxFeishuAttachmentImageBytes = 30 * 1024 * 1024;

export async function publishPostsToFeishu(posts: GeneratedPost[], options: PublishPostsToFeishuOptions = {}) {
  const outboxDir = path.join(process.cwd(), "data", "feishu-outbox");
  await mkdir(outboxDir, { recursive: true });
  const payloadPath = path.join(outboxDir, `posts-${Date.now()}.json`);
  await writeFile(payloadPath, JSON.stringify({ posts }, null, 2), "utf8");

  if (!appConfig.feishuCliBin) {
    return {
      status: "needs_config" as const,
      payloadPath,
      message: "FEISHU_CLI_BIN is not configured. Payload has been staged locally.",
      recordMappings: [] as FeishuRecordMapping[],
      postStates: buildStagedFeishuPostStateUpdates(posts, payloadPath),
      attachmentUploads: [] as FeishuAttachmentUpload[],
      attachmentFailures: [] as FeishuAttachmentFailure[],
    };
  }

  if (!appConfig.feishuAppId || !appConfig.feishuAppSecret) {
    return {
      status: "needs_config" as const,
      payloadPath,
      message: "FEISHU_APP_ID or FEISHU_APP_SECRET is not configured. Payload has been staged locally.",
      recordMappings: [] as FeishuRecordMapping[],
      postStates: buildStagedFeishuPostStateUpdates(posts, payloadPath),
      attachmentUploads: [] as FeishuAttachmentUpload[],
      attachmentFailures: [] as FeishuAttachmentFailure[],
    };
  }

  if (!appConfig.feishuBitableAppToken || !appConfig.feishuBitableTableId) {
    return {
      status: "needs_config" as const,
      payloadPath,
      message: "FEISHU_BITABLE_APP_TOKEN or FEISHU_BITABLE_TABLE_ID is not configured. Payload has been staged locally.",
      recordMappings: [] as FeishuRecordMapping[],
      postStates: buildStagedFeishuPostStateUpdates(posts, payloadPath),
      attachmentUploads: [] as FeishuAttachmentUpload[],
      attachmentFailures: [] as FeishuAttachmentFailure[],
    };
  }

  const fieldMap = getBitableFieldMap();
  const useDefaultBaseCreate = !appConfig.feishuCliArgs.trim();
  const attachmentFiles =
    useDefaultBaseCreate && fieldMap.imageUrls ? await prepareAttachmentFilesForPosts(posts) : new Map<string, PreparedAttachmentSet>();

  try {
  const recordPayloadPaths: string[] = [];
  const stdoutParts: string[] = [];
  const stderrParts: string[] = [];
  const attachmentUploads: FeishuAttachmentUpload[] = [];
  const attachmentFailures: FeishuAttachmentFailure[] = [];
  const recordMappings: FeishuRecordMapping[] = [];
  const chunks = chunkPosts(posts, feishuRecordBatchSize);

  for (const [chunkIndex, chunk] of chunks.entries()) {
    const existingMappings = useDefaultBaseCreate
      ? chunk
          .map((post) => {
            const recordId = getExistingFeishuRecordId(post);
            return recordId ? { postId: post.id, recordId, created: false } : null;
          })
          .filter((item): item is FeishuRecordMapping => Boolean(item))
      : [];
    recordMappings.push(...existingMappings);

    const postsToCreate = useDefaultBaseCreate ? chunk.filter((post) => !getExistingFeishuRecordId(post)) : chunk;
    if (postsToCreate.length) {
      const recordPayloadPath = path.join(outboxDir, `base-records-${Date.now()}-${chunkIndex + 1}.json`);
      recordPayloadPaths.push(recordPayloadPath);
      await writeFile(recordPayloadPath, JSON.stringify(buildBitableRecordPayload(postsToCreate, fieldMap), null, 2), "utf8");

      const args = buildCliArgs(payloadPath, recordPayloadPath);
      const result = await runFeishuCli(args, {
        timeout: 120_000,
        maxBuffer: 1024 * 1024 * 8,
        env: buildCliEnv({
          ...process.env,
          FEISHU_PAYLOAD_PATH: payloadPath,
          FEISHU_RECORD_PAYLOAD_PATH: recordPayloadPath,
          FEISHU_BITABLE_APP_TOKEN: appConfig.feishuBitableAppToken,
          FEISHU_BITABLE_TABLE_ID: appConfig.feishuBitableTableId,
        }),
      });
      stdoutParts.push(result.stdout);
      stderrParts.push(result.stderr);

      const createdRecordIds = parseCreatedRecordIds(result.stdout);
      if (createdRecordIds.length < postsToCreate.length) {
        throw new Error("Feishu record creation did not return enough record IDs for attachment upload.");
      }
      recordMappings.push(
        ...postsToCreate.map((post, index) => ({
          postId: post.id,
          recordId: createdRecordIds[index],
          created: true,
        })),
      );
    }

    if (useDefaultBaseCreate && fieldMap.imageUrls) {
      const uploadResult = await uploadGeneratedMediaToFeishu(chunk, recordMappings, fieldMap.imageUrls, attachmentFiles);
      attachmentUploads.push(...uploadResult.uploads);
      attachmentFailures.push(...uploadResult.failures);
    }
  }
  const postStates = buildFeishuPostStateUpdates(posts, recordMappings, attachmentUploads, attachmentFailures, payloadPath);
  const notification = await sendFeishuPublishNotification(posts, attachmentUploads, {
    ...options.notificationContext,
    status: attachmentFailures.length ? "attachment_failed" : "published",
    recordMappings,
    attachmentFailureCount: attachmentFailures.length,
  });

  if (attachmentFailures.length) {
    await recordExecutionLog({
      scope: "publish/feishu",
      action: "Feishu attachment upload incomplete",
      status: "error",
      message: formatAttachmentFailureMessage(attachmentFailures),
      details: {
        postCount: posts.length,
        recordCount: recordMappings.length,
        attachmentFailureCount: attachmentFailures.length,
      },
    });
  }

  return {
    status: attachmentFailures.length ? ("attachment_failed" as const) : ("published" as const),
    payloadPath,
    recordPayloadPath: recordPayloadPaths[0],
    recordPayloadPaths,
    batchSize: feishuRecordBatchSize,
    chunkCount: chunks.length,
    message: attachmentFailures.length
      ? `Feishu Base records were created or reused for ${recordMappings.length} posts, but ${attachmentFailures.length} attachment upload(s) failed. Retry will reuse existing record IDs and upload only unfinished attachments.`
      : `Feishu Base write completed for ${posts.length} posts in ${chunks.length} chunk(s) of up to ${feishuRecordBatchSize}.`,
    recordMappings,
    postStates,
    attachmentUploads,
    attachmentFailures,
    notification,
    stdout: stdoutParts.filter(Boolean).join("\n"),
    stderr: stderrParts.filter(Boolean).join("\n"),
  };
  } finally {
    await cleanupPreparedAttachmentFiles(attachmentFiles);
  }
}

function chunkPosts<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function buildCliArgs(payloadPath: string, recordPayloadPath: string) {
  const cliPayloadPath = toCliRelativePath(payloadPath);
  const cliRecordPayloadPath = toCliRelativePath(recordPayloadPath);
  const templateArgs = appConfig.feishuCliArgs
    ? splitArgs(appConfig.feishuCliArgs)
    : [
        "base",
        "+record-batch-create",
        "--as",
        "bot",
        "--base-token",
        "{appToken}",
        "--table-id",
        "{tableId}",
        "--json",
        "@{recordPayload}",
      ];

  return templateArgs
    .map((arg) => arg.replaceAll("{payload}", cliPayloadPath))
    .map((arg) => arg.replaceAll("{recordPayload}", cliRecordPayloadPath))
    .map((arg) => arg.replaceAll("{appToken}", appConfig.feishuBitableAppToken))
    .map((arg) => arg.replaceAll("{tableId}", appConfig.feishuBitableTableId));
}

function toCliRelativePath(filePath: string) {
  const relativePath = path.relative(process.cwd(), filePath);
  return relativePath.startsWith("..") ? filePath : `./${relativePath.replaceAll("\\", "/")}`;
}

function buildBitableRecordPayload(posts: GeneratedPost[], fieldMap: Record<string, string>) {
  const entries = Object.entries(fieldMap).filter(([key, fieldName]) => key !== "imageUrls" && fieldName.trim());

  return {
    fields: entries.map(([, fieldName]) => fieldName),
    rows: posts.map((post) => entries.map(([key]) => getPostFieldValue(post, key))),
  };
}

function getBitableFieldMap() {
  const defaults: Record<string, string> = {
    title: "动态标题",
    body: "动态正文",
    imageUrls: "动态素材",
    contentTags: "内容标签",
    contentCreationSource: "内容创作来源",
    vehicle: "车型",
  };

  if (!appConfig.feishuBitableFieldMap.trim()) return defaults;

  try {
    const parsed = JSON.parse(appConfig.feishuBitableFieldMap) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries({ ...defaults, ...parsed })
        .filter(([, value]) => typeof value === "string")
        .map(([key, value]) => [key, value as string]),
    );
  } catch (error) {
    throw new Error(`FEISHU_BITABLE_FIELD_MAP must be valid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`);
  }
}

async function uploadGeneratedMediaToFeishu(
  posts: GeneratedPost[],
  recordMappings: FeishuRecordMapping[],
  attachmentFieldName: string,
  attachmentFiles: PreparedAttachmentFiles,
) {
  if (!posts.some(countPostMedia)) return { uploads: [] as FeishuAttachmentUpload[], failures: [] as FeishuAttachmentFailure[] };
  const recordIdByPostId = new Map(recordMappings.map((item) => [item.postId, item.recordId]));

  const results = await mapWithConcurrency(posts, concurrencyConfig.feishuAttachment, async (post) => {
    const mediaCount = countPostMedia(post);
    if (!mediaCount) return { upload: null, failure: null };

    const recordId = recordIdByPostId.get(post.id);
    if (!recordId) {
      return {
        upload: null,
        failure: {
          postId: post.id,
          recordId: "",
          fileCount: 0,
          error: "Feishu record ID is missing for attachment upload.",
        },
      };
    }
    const prepared = attachmentFiles.get(post.id) || (await resolvePostAttachmentFiles(post));
    const files = prepared.files;
    try {
      if (!files.length) {
      return {
        upload: null,
        failure: {
          postId: post.id,
          recordId,
          fileCount: 0,
          error: `Post ${post.id} has media URLs but no local files that can be uploaded to Feishu attachments.`,
        },
      };
      }
      if (files.length > 50) {
      return {
        upload: null,
        failure: {
          postId: post.id,
          recordId,
          fileCount: files.length,
          error: `Post ${post.id} has ${files.length} media files; Feishu attachment upload supports at most 50 files per cell.`,
        },
      };
      }

      if (post.feishu?.recordId === recordId && post.feishu.attachmentStatus === "uploaded" && post.feishu.attachmentFileCount === files.length) {
      return {
        upload: {
          postId: post.id,
          recordId,
          fileCount: files.length,
          status: "skipped" as const,
          stdout: "",
          stderr: "",
        },
        failure: null,
      };
      }

      const args = [
      "base",
      "+record-upload-attachment",
      "--as",
      "bot",
      "--base-token",
      appConfig.feishuBitableAppToken,
      "--table-id",
      appConfig.feishuBitableTableId,
      "--record-id",
      recordId,
      "--field-id",
      attachmentFieldName,
      ...files.flatMap((file) => ["--file", file]),
    ];

      try {
        const result = await runFeishuCli(args, {
        timeout: 300_000,
        maxBuffer: 1024 * 1024 * 8,
        env: buildCliEnv(process.env),
      });
        return {
        upload: {
          postId: post.id,
          recordId,
          fileCount: files.length,
          status: "uploaded" as const,
          stdout: result.stdout,
          stderr: result.stderr,
        },
        failure: null,
      };
      } catch (error) {
        return {
        upload: null,
        failure: {
          postId: post.id,
          recordId,
          fileCount: files.length,
          error: compactCliError(error),
          stdout: getCliOutput(error, "stdout"),
          stderr: getCliOutput(error, "stderr"),
        },
        };
      }
    } finally {
      await prepared.cleanup();
    }
  });

  return {
    uploads: results.map((item) => item.upload).filter((item): item is FeishuAttachmentUpload => Boolean(item)),
    failures: results.map((item) => item.failure).filter((item): item is FeishuAttachmentFailure => Boolean(item)),
  };
}

function buildFeishuPostStateUpdates(
  posts: GeneratedPost[],
  recordMappings: FeishuRecordMapping[],
  attachmentUploads: FeishuAttachmentUpload[],
  attachmentFailures: FeishuAttachmentFailure[],
  payloadPath: string,
): FeishuPostStateUpdate[] {
  const mappingByPostId = new Map(recordMappings.map((item) => [item.postId, item]));
  const uploadByPostId = new Map(attachmentUploads.map((item) => [item.postId, item]));
  const failureByPostId = new Map(attachmentFailures.map((item) => [item.postId, item]));
  const now = new Date().toISOString();

  return posts.map((post) => {
    const mapping = mappingByPostId.get(post.id);
    const upload = uploadByPostId.get(post.id);
    const failure = failureByPostId.get(post.id);
    const recordId = mapping?.recordId || post.feishu?.recordId;
    const next: FeishuPostPublishState = {
      ...post.feishu,
      ...(recordId ? { recordId } : {}),
      ...(mapping?.created ? { recordCreatedAt: now } : {}),
      payloadPath,
    };

    if (failure) {
      return {
        postId: post.id,
        feishu: {
          ...next,
          attachmentStatus: "failed",
          attachmentFileCount: failure.fileCount,
          attachmentError: failure.error,
        },
      };
    }

    if (upload) {
      return {
        postId: post.id,
        feishu: {
          ...next,
          attachmentStatus: "uploaded",
          attachmentFileCount: upload.fileCount,
          attachmentUploadedAt: upload.status === "uploaded" ? now : post.feishu?.attachmentUploadedAt || now,
          attachmentError: undefined,
        },
      };
    }

    return {
      postId: post.id,
      feishu: {
        ...next,
        attachmentStatus: countPostMedia(post) ? "pending" : "skipped",
        attachmentFileCount: 0,
        attachmentError: undefined,
      },
    };
  });
}

function buildStagedFeishuPostStateUpdates(posts: GeneratedPost[], payloadPath: string): FeishuPostStateUpdate[] {
  return posts.map((post) => ({
    postId: post.id,
    feishu: {
      ...post.feishu,
      payloadPath,
      attachmentStatus: countPostMedia(post) ? "pending" : "skipped",
      attachmentFileCount: 0,
    },
  }));
}

function getExistingFeishuRecordId(post: GeneratedPost) {
  const recordId = post.feishu?.recordId?.trim();
  return recordId && recordId.startsWith("rec") ? recordId : "";
}

function formatAttachmentFailureMessage(failures: FeishuAttachmentFailure[]) {
  const first = failures[0];
  if (!first) return "Feishu attachment upload failed.";
  return `Feishu attachment upload failed for ${failures.length} post(s). First failure: ${first.postId}: ${first.error}`;
}

async function prepareAttachmentFilesForPosts(posts: GeneratedPost[]): Promise<PreparedAttachmentFiles> {
  const attachments: PreparedAttachmentFiles = new Map();
  const completedSets: PreparedAttachmentSet[] = [];
  try {
    const prepared = await mapWithConcurrency(posts, concurrencyConfig.media, async (post) => {
      const attachmentSet = await resolvePostAttachmentFiles(post);
      completedSets.push(attachmentSet);
      const { files, failures } = attachmentSet;
      if (failures.length) {
        throw new Error(
          `Post ${post.id} has media URLs that could not be prepared for Feishu attachments: ${failures
            .slice(0, 5)
            .join("; ")}`,
        );
      }
      if (!files.length && countPostMedia(post)) {
        throw new Error(`Post ${post.id} has media URLs but no local files that can be uploaded to Feishu attachments.`);
      }
      if (files.length > 50) {
        throw new Error(`Post ${post.id} has ${files.length} media files; Feishu attachment upload supports at most 50 files per cell.`);
      }
      return { postId: post.id, attachmentSet };
    });
    for (const item of prepared) {
      attachments.set(item.postId, item.attachmentSet);
    }
    return attachments;
  } catch (error) {
    await Promise.all(completedSets.map((item) => item.cleanup()));
    throw error;
  }
}

async function cleanupPreparedAttachmentFiles(attachments: PreparedAttachmentFiles) {
  await Promise.all(Array.from(attachments.values(), (item) => item.cleanup()));
}

async function resolvePostAttachmentFiles(post: GeneratedPost) {
  const files: string[] = [];
  const failures: string[] = [];
  const cleanups: Array<() => Promise<void>> = [];

  for (const [index, imageUrl] of post.imageUrls.entries()) {
    const localFile = resolveLocalMediaFile(imageUrl, "image");
    if (localFile) {
      files.push(localFile);
      continue;
    }

    if (!isProxyableRemoteMediaUrl(imageUrl)) {
      failures.push(`image ${index + 1} is not a local file or HTTP(S) URL`);
      continue;
    }

    try {
      const materialized = await materializeRuntimeMedia(imageUrl, { maxBytes: maxFeishuAttachmentImageBytes, kind: "image" });
      files.push(toCliRelativePath(materialized.filePath));
      cleanups.push(materialized.cleanup);
    } catch (error) {
      failures.push(`image ${index + 1} download failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  const localVideoFiles: string[] = [];
  const videoFailures: string[] = [];
  for (const [index, url] of postVideoUrls(post).entries()) {
    const localFile = resolveLocalMediaFile(url, "video");
    if (localFile) {
      localVideoFiles.push(localFile);
      continue;
    }

    if (!isProxyableRemoteMediaUrl(url)) {
      videoFailures.push(`video ${index + 1} is not a local file or HTTP(S) URL`);
      continue;
    }
    try {
      const materialized = await materializeRuntimeMedia(url, { maxBytes: 150 * 1024 * 1024, kind: "video" });
      localVideoFiles.push(toCliRelativePath(materialized.filePath));
      cleanups.push(materialized.cleanup);
    } catch (error) {
      videoFailures.push(`video ${index + 1} download failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  files.push(...localVideoFiles);
  if (!localVideoFiles.length) failures.push(...videoFailures);

  return {
    files,
    failures,
    cleanup: async () => {
      await Promise.all(cleanups.map((cleanup) => cleanup()));
    },
  };
}

function hashString(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

async function sendFeishuPublishNotification(
  posts: GeneratedPost[],
  attachmentUploads: Array<{ postId: string; recordId: string; fileCount: number }>,
  context: FeishuPublishNotificationSummary,
): Promise<FeishuNotificationResult> {
  const chatId = appConfig.feishuNotifyChatId.trim();
  const userId = appConfig.feishuNotifyUserId.trim();

  if (!chatId && !userId) {
    return {
      status: "skipped",
      message: "FEISHU_NOTIFY_CHAT_ID or FEISHU_NOTIFY_USER_ID is not configured.",
    };
  }

  const recipientType = chatId ? "chat" : "user";
  const recipientId = chatId || userId;
  const args = [
    "im",
    "+messages-send",
    "--as",
    "bot",
    recipientType === "chat" ? "--chat-id" : "--user-id",
    recipientId,
    "--text",
    buildPublishNotificationText(posts, attachmentUploads, context),
    "--idempotency-key",
    buildNotificationIdempotencyKey(posts, context),
  ];

  try {
    const result = await runFeishuCli(args, {
      timeout: 60_000,
      maxBuffer: 1024 * 1024 * 4,
      env: buildCliEnv(process.env),
    });
    return {
      status: "sent",
      recipientType,
      message: recipientType === "chat" ? "Feishu group notification sent." : "Feishu direct notification sent.",
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    return {
      status: "failed",
      recipientType,
      message: compactCliError(error),
      stdout: getCliOutput(error, "stdout"),
      stderr: getCliOutput(error, "stderr"),
    };
  }
}

function buildPublishNotificationText(
  posts: GeneratedPost[],
  attachmentUploads: Array<{ postId: string; recordId: string; fileCount: number }>,
  context: FeishuPublishNotificationSummary,
) {
  const mediaCount = posts.reduce((total, post) => total + countPostMedia(post), 0);
  const uploadedMediaCount = attachmentUploads.reduce((total, item) => total + item.fileCount, 0);
  const createdCount = context.recordMappings.filter((item) => item.created).length;
  const reusedCount = Math.max(0, context.recordMappings.length - createdCount);
  const recordCount = context.recordMappings.length || posts.length;
  const header = context.status === "attachment_failed" ? "FluxPost Studio 写入飞书部分完成" : "FluxPost Studio 写入飞书成功";
  const lines = [
    header,
    `任务：${formatNotificationTask(posts, context)}`,
  ];

  const sourceLine = formatNotificationSource(context);
  if (sourceLine) lines.push(`来源：${sourceLine}`);
  if (context.ownerDisplayName?.trim()) lines.push(`发起人：${compactNotificationText(context.ownerDisplayName, 40)}`);
  if (context.jobId) lines.push(`任务ID：${context.jobId}`);

  lines.push(`记录：${formatNotificationRecordLine(recordCount, createdCount, reusedCount)}`);
  lines.push(
    context.status === "attachment_failed"
      ? `素材：已上传 ${uploadedMediaCount} 个，失败 ${context.attachmentFailureCount} 组`
      : `素材：${uploadedMediaCount || mediaCount} 个`,
  );
  lines.push(...formatNotificationContentLines(posts));
  lines.push(`时间：${formatFeishuDateTime(new Date().toISOString())}`);
  lines.push(
    context.status === "attachment_failed"
      ? "请优先检查飞书多维表格中的动态素材，必要时重试附件上传。"
      : "请到目标飞书多维表格复核动态标题、动态正文和动态素材。",
  );

  return lines.join("\n");
}

function formatNotificationTask(posts: GeneratedPost[], context: FeishuPublishNotificationSummary) {
  if (posts.length === 1) return "单条发布";
  if (context.source === "simple") return `简单任务批量发布 ${posts.length} 条图文`;
  if (context.source === "manual") return `手动批量发布 ${posts.length} 条图文`;
  return `批量发布 ${posts.length} 条图文`;
}

function formatNotificationSource(context: FeishuPublishNotificationSummary) {
  if (context.source === "simple") return context.sourceRunId ? `简单任务 ${context.sourceRunId}` : "简单任务";
  if (context.source === "manual") return "手动发布";
  return undefined;
}

function formatNotificationRecordLine(recordCount: number, createdCount: number, reusedCount: number) {
  if (!createdCount && !reusedCount) return `成功写入 ${recordCount} 条`;
  if (!reusedCount) return `成功写入 ${recordCount} 条（新建 ${createdCount}）`;
  if (!createdCount) return `成功写入 ${recordCount} 条（复用 ${reusedCount}）`;
  return `成功写入 ${recordCount} 条（新建 ${createdCount}，复用 ${reusedCount}）`;
}

function formatNotificationContentLines(posts: GeneratedPost[]) {
  const titles = posts.map((post) => compactNotificationText(post.title, 64)).filter(Boolean);
  if (!titles.length) return [] as string[];
  if (posts.length === 1) return [`内容：${titles[0]}`];
  return ["内容示例：", ...titles.slice(0, 3).map((title, index) => `${index + 1}. ${title}`)];
}

function compactNotificationText(value: string | undefined, maxLength: number) {
  const normalized = value?.replace(/\s+/g, " ").trim() || "";
  if (Array.from(normalized).length <= maxLength) return normalized;
  return `${Array.from(normalized).slice(0, maxLength - 1).join("")}…`;
}

function buildNotificationIdempotencyKey(posts: GeneratedPost[], context?: FeishuPublishNotificationContext) {
  const fingerprint = [context?.jobId, ...posts.map((post) => post.id)].filter(Boolean).join("|") || "post";
  return `fp-${Date.now().toString(36)}-${hashString(fingerprint)}`;
}

function compactCliError(error: unknown) {
  return error instanceof Error ? sanitizeCliText(error.message) : "Feishu notification failed with an unknown CLI error.";
}

function getCliOutput(error: unknown, key: "stdout" | "stderr") {
  if (!error || typeof error !== "object") return undefined;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? sanitizeCliText(value) : undefined;
}

export async function ensureConfiguredFeishuCliIdentity(options: FeishuCliRunOptions) {
  const invocation = resolveFeishuCliInvocation(appConfig.feishuCliBin);
  try {
    await ensureFeishuCliIdentity(
      {
        appId: appConfig.feishuAppId,
        appSecret: appConfig.feishuAppSecret,
        brand: appConfig.feishuBrand,
      },
      (identityArgs, input) => execFeishuCliWithInput(invocation, identityArgs, options, input),
    );
  } catch (error) {
    throw sanitizeCliError(error);
  }
}

async function runFeishuCli(args: string[], options: FeishuCliRunOptions) {
  const invocation = resolveFeishuCliInvocation(appConfig.feishuCliBin);
  return runWithConcurrencyPool("feishu", async () => {
    try {
      await ensureConfiguredFeishuCliIdentity(options);
      return await execFileAsync(invocation.file, [...invocation.argsPrefix, ...args], {
        timeout: options.timeout,
        windowsHide: true,
        maxBuffer: options.maxBuffer,
        env: options.env,
      });
    } catch (error) {
      throw sanitizeCliError(error);
    }
  });
}

function execFeishuCliWithInput(
  invocation: CliInvocation,
  args: string[],
  options: FeishuCliRunOptions,
  input: string,
) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = execFile(
      invocation.file,
      [...invocation.argsPrefix, ...args],
      {
        timeout: options.timeout,
        windowsHide: true,
        maxBuffer: options.maxBuffer,
        env: options.env,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (error) {
          const failure = error as Error & { stdout?: string; stderr?: string };
          failure.stdout = stdout;
          failure.stderr = stderr;
          reject(failure);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
    if (!child.stdin) {
      child.kill();
      reject(new Error("Feishu CLI stdin is unavailable."));
      return;
    }
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") reject(error);
    });
    child.stdin.end(input);
  });
}

function sanitizeCliError(error: unknown) {
  if (!(error instanceof Error)) return new Error("Feishu CLI failed with an unknown error.");
  const next = new Error(sanitizeCliText(error.message));
  const source = error as Error & { stdout?: string; stderr?: string; code?: unknown; signal?: unknown };
  const target = next as Error & { stdout?: string; stderr?: string; code?: unknown; signal?: unknown };
  if (typeof source.stdout === "string") target.stdout = sanitizeCliText(source.stdout);
  if (typeof source.stderr === "string") target.stderr = sanitizeCliText(source.stderr);
  if (source.code !== undefined) target.code = source.code;
  if (source.signal !== undefined) target.signal = source.signal;
  return next;
}

function sanitizeCliText(value: string) {
  let next = value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer ***").replace(/(--base-token\s+)(\S+)/gi, "$1***");
  if (appConfig.feishuBitableAppToken) {
    next = next.replaceAll(appConfig.feishuBitableAppToken, "***");
  }
  if (appConfig.feishuAppSecret) {
    next = next.replaceAll(appConfig.feishuAppSecret, "***");
  }
  return next;
}

export function resolveFeishuCliInvocation(configuredBin: string): CliInvocation {
  const command = stripWrappingQuotes(configuredBin.trim());
  if (!command) {
    throw new Error("FEISHU_CLI_BIN is not configured.");
  }

  if (process.platform === "win32") {
    const larkCliScript = resolveLarkCliNodeScript(command);
    if (larkCliScript) {
      return {
        file: process.execPath,
        argsPrefix: [larkCliScript],
      };
    }

    const directExecutable = resolveWindowsExecutable(command);
    if (directExecutable) {
      return {
        file: directExecutable,
        argsPrefix: [],
      };
    }
  }

  if (command.toLowerCase().endsWith(".js") && existsSync(command)) {
    return {
      file: process.execPath,
      argsPrefix: [command],
    };
  }

  return {
    file: command,
    argsPrefix: [],
  };
}

function resolveLarkCliNodeScript(command: string) {
  const baseName = path.basename(command).toLowerCase().replace(/\.(cmd|ps1|exe)$/i, "");
  if (baseName !== "lark-cli") return null;

  const candidateDirs = new Set<string>();
  if (/[\\/]/.test(command)) {
    candidateDirs.add(path.dirname(command));
  }
  for (const item of getPathDirs()) candidateDirs.add(item);
  if (process.env.APPDATA) candidateDirs.add(path.join(process.env.APPDATA, "npm"));
  if (process.env.npm_config_prefix) candidateDirs.add(process.env.npm_config_prefix);

  for (const dir of candidateDirs) {
    const scriptPath = path.join(dir, "node_modules", "@larksuite", "cli", "scripts", "run.js");
    if (existsSync(scriptPath)) return scriptPath;
  }
  return null;
}

function resolveWindowsExecutable(command: string) {
  if (path.isAbsolute(command) || /[\\/]/.test(command)) {
    const direct = resolveWindowsExecutableAt(command);
    if (direct) return direct;
    return null;
  }

  for (const dir of getPathDirs()) {
    const direct = resolveWindowsExecutableAt(path.join(dir, command));
    if (direct) return direct;
  }
  return null;
}

function resolveWindowsExecutableAt(candidate: string) {
  const extension = path.extname(candidate).toLowerCase();
  if (extension && extension !== ".cmd" && extension !== ".bat" && existsSync(candidate)) return candidate;

  const pathext = (process.env.PATHEXT || ".EXE;.COM").split(";").filter(Boolean);
  for (const ext of pathext) {
    const file = `${candidate}${ext.toLowerCase()}`;
    if (existsSync(file) && !file.toLowerCase().endsWith(".cmd") && !file.toLowerCase().endsWith(".bat")) return file;
  }
  return null;
}

function getPathDirs() {
  return (process.env.PATH || process.env.Path || "")
    .split(path.delimiter)
    .map((item) => stripWrappingQuotes(item.trim()))
    .filter(Boolean);
}

function stripWrappingQuotes(value: string) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseCreatedRecordIds(stdout: string) {
  if (!stdout.trim()) return [];
  const parsed = JSON.parse(stdout) as unknown;
  return findStringArray(parsed, "record_id_list") || findRecordIds(parsed);
}

function findStringArray(value: unknown, key: string): string[] | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record[key]) && record[key].every((item) => typeof item === "string")) return record[key] as string[];
  for (const child of Object.values(record)) {
    const result = findStringArray(child, key);
    if (result) return result;
  }
  return null;
}

function findRecordIds(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => findRecordIds(item));
  }
  const record = value as Record<string, unknown>;
  const id = record.record_id || record.recordId || record.id;
  const current = typeof id === "string" && id.startsWith("rec") ? [id] : [];
  return [...current, ...Object.values(record).flatMap((item) => findRecordIds(item))];
}

function resolveLocalMediaFile(url: string, kind: "image" | "video") {
  if (!url || /^https?:\/\//i.test(url)) return null;

  const cleanUrl = url.split(/[?#]/, 1)[0];
  if (!isLikelyLocalMediaKind(cleanUrl, kind)) return null;
  const normalizedUrl = cleanUrl.startsWith("/") ? cleanUrl.slice(1) : cleanUrl;
  const absolutePath = cleanUrl.startsWith("/")
    ? path.join(process.cwd(), "public", normalizedUrl)
    : path.isAbsolute(cleanUrl)
      ? cleanUrl
      : path.join(process.cwd(), "public", normalizedUrl);
  if (!existsSync(absolutePath)) return null;

  const relativePath = path.relative(process.cwd(), absolutePath);
  return relativePath.startsWith("..") ? absolutePath : `./${relativePath.replaceAll("\\", "/")}`;
}

function isLikelyLocalMediaKind(url: string, kind: "image" | "video") {
  const extension = path.extname(url).toLowerCase();
  if (!extension) return true;
  if (kind === "video") return [".mp4", ".mov", ".m4v", ".webm"].includes(extension);
  return [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif"].includes(extension);
}

function postVideoUrls(post: GeneratedPost) {
  return Array.isArray(post.videoUrls) ? post.videoUrls.filter(Boolean) : [];
}

function countPostMedia(post: GeneratedPost) {
  return post.imageUrls.length + postVideoUrls(post).length;
}

function getPostFieldValue(post: GeneratedPost, key: string) {
  switch (key) {
    case "title":
      return post.title;
    case "body":
      return post.body;
    case "platform":
      return formatPlatform(post.platform);
    case "status":
      return formatReviewStatus(post.status);
    case "imageUrls":
      return post.imageUrls.join("\n");
    case "contentTags":
      return post.contentTags || [];
    case "contentCreationSource":
      return formatContentCreationSource(post);
    case "vehicle":
      return formatVehicleFieldValue(post);
    case "imagePrompt":
      return post.imagePrompt;
    case "aiNotes":
      return post.aiNotes.join("\n");
    case "materialPaths":
      return post.materialPaths.join("\n");
    case "sourceItemId":
      return post.sourceItemId;
    case "postId":
      return post.id;
    case "version":
      return post.version || 1;
    case "createdAt":
      return formatFeishuDateTime(post.createdAt);
    case "updatedAt":
      return formatFeishuDateTime(post.updatedAt);
    default:
      return null;
  }
}

function formatContentCreationSource(post: GeneratedPost) {
  const displayName = post.ownerDisplayName?.trim();
  if (displayName) return displayName;
  const ownerId = post.ownerUserId?.trim();
  if (!ownerId) return null;
  return ownerId.startsWith("whitelist:") ? ownerId.slice("whitelist:".length) || ownerId : ownerId;
}

function formatVehicleFieldValue(post: GeneratedPost) {
  return post.feishuVehicle?.trim() || post.taskKeyword?.trim() || null;
}

function formatPlatform(value: GeneratedPost["platform"]) {
  const labels: Record<GeneratedPost["platform"], string> = {
    wechat_channels: "视频号",
    xiaohongshu: "小红书",
    douyin: "抖音",
    weibo: "微博",
    feishu: "飞书",
    original: "原创",
    xiaopeng_bbs: "小鹏社区",
    dongchedi: "\u61c2\u8f66\u5e1d",
  };
  return labels[value] || value;
}

function formatReviewStatus(value: GeneratedPost["status"]) {
  const labels: Record<GeneratedPost["status"], string> = {
    draft: "草稿",
    editing: "编辑中",
    approved: "已审查",
    published: "已发布",
  };
  return labels[value] || value;
}

function formatFeishuDateTime(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day} ${lookup.hour}:${lookup.minute}:${lookup.second}`;
}

function buildCliEnv(env: NodeJS.ProcessEnv) {
  const nextEnv = { ...env };
  const proxy = nextEnv.HTTPS_PROXY || nextEnv.https_proxy || nextEnv.HTTP_PROXY || nextEnv.http_proxy || "";
  if (/^http:\/\/127\.0\.0\.1:9\/?$/i.test(proxy)) {
    nextEnv.LARK_CLI_NO_PROXY = "1";
    nextEnv.HTTPS_PROXY = "";
    nextEnv.HTTP_PROXY = "";
    nextEnv.https_proxy = "";
    nextEnv.http_proxy = "";
  }
  return nextEnv;
}

function splitArgs(value: string) {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (const char of value) {
    if ((char === '"' || char === "'") && quote === null) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = null;
      continue;
    }
    if (char === " " && quote === null) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current) args.push(current);
  return args.map((arg) => arg.replaceAll("{tmp}", os.tmpdir()));
}
