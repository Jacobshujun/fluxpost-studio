import { compactError, recordExecutionLog, runWithExecutionLogOwner } from "./activity-log";
import { buildDefaultImageTasks } from "./creation-controls";
import { concurrencyConfig, mapWithConcurrency, runWithConcurrencyPool } from "./concurrency";
import { calculateHotScore, ingestCrawlItems, markSourceRewritten } from "./content-pool";
import {
  claimNextSimpleRunQueueItem,
  completeSimpleRunQueueItem,
  enqueueSimpleRunQueueItem,
  failSimpleRunQueueItem,
  failSimpleRunQueueItemByRunId,
  getSimpleRunFromDb,
  getSimpleRunQueueItemByRunId,
  heartbeatSimpleRunQueueItem,
  readSimpleRunsFromDb,
  saveSimpleRunToDb,
} from "./database";
import { enqueueFeishuPublishJob, ensureFeishuPublishQueueWorker } from "./feishu-publish-queue";
import { importFeishuContentByTaskNumbers, normalizeFeishuTaskNumberInput } from "./feishu-content-import";
import { saveGeneratedPost } from "./generated-posts";
import { generateImagesFromPrompt } from "./image-generation";
import { generatePost } from "./openai";
import { isComfyUiKleinConfigured } from "./comfyui-klein";
import { buildProductionPlan } from "./production-plan";
import { savePost } from "./store";
import { syncSourceItemsToFeishu } from "./source-import-feishu";
import { resolveSourceLinks, type SourceLinkImportResult } from "./source-link-import";
import { filterUnsafeSourceItems } from "./source-safety";
import { tagSourceItems } from "./source-tagging";
import { crawlTikHub } from "./tikhub";
import { defaultWorkspacePromptSettings, getWorkspacePromptSettings, saveWorkspacePromptSettings } from "./workspace-settings";
import {
  accessActorFromOwner,
  applyWorkspaceOwner,
  filterWorkspaceOwnedRecords,
  type WorkspaceAccessActor,
} from "./workspace-ownership";
import type {
  CrawlInput,
  CrawlPlatform,
  GeneratedPost,
  NormalizedSourceItem,
  Platform,
  SimpleRun,
  SimpleRunInput,
  SimpleRunLinkResult,
  SimpleRunStage,
  SimpleRunStageId,
  SimpleRunStageStatus,
  SourceImageTask,
  SourceLinkPlatform,
  WorkspacePromptSettings,
} from "./types";

type CreateSimpleRunInput = Omit<
  SimpleRunInput,
  "materialPaths" | "platforms" | "targetCount" | "links" | "linkPlatform" | "feishuTaskNumbers" | "sourceMode"
> & {
  sourceMode?: SimpleRunInput["sourceMode"];
  targetCount?: number;
  platforms?: CrawlPlatform[];
  materialPaths?: string[];
  links?: string[] | string;
  linkPlatform?: SimpleRunInput["linkPlatform"];
  feishuTaskNumbers?: string[] | string;
  ownerUserId?: string;
  ownerDisplayName?: string;
  settings?: Partial<WorkspacePromptSettings>;
};

const maxSimpleRunItems = readBoundedIntegerEnv("SIMPLE_RUN_MAX_ITEMS", 500, 10, 2000);
const maxSimpleImageTasksPerPost = 9;
const simpleRunQueueWorkerConcurrency = readBoundedIntegerEnv("SIMPLE_RUN_WORKER_CONCURRENCY", 4, 1, 10);
const simpleRunQueueLockMs = 5 * 60_000;
const simpleRunQueueHeartbeatMs = 30_000;
const simpleRunForceTerminateMessage = "用户已强制终止该任务。";
const simpleRunPublishPersistMaxAttempts = 3;
const simpleRunPublishPersistRetryDelayMs = 60;

const stageTitles: Record<SimpleRunStageId, string> = {
  crawl: "采集内容",
  tag: "AI 打标",
  produce: "生成图文",
  publish: "写入飞书",
};

export async function listSimpleRuns(limit = 20, account?: WorkspaceAccessActor) {
  await reconcileInterruptedSimpleRuns(limit);
  ensureSimpleRunQueueWorker();
  ensureFeishuPublishQueueWorker();
  return filterWorkspaceOwnedRecords((await readSimpleRunsFromDb(limit)).map(ensureSimpleRunOwner), account);
}

export async function getSimpleRun(runId: string, account?: WorkspaceAccessActor) {
  const storedRun = await getSimpleRunFromDb(runId);
  const run = storedRun ? ensureSimpleRunOwner(storedRun) : undefined;
  if (!run || (account && !filterWorkspaceOwnedRecords([run], account).length)) return undefined;
  return run;
}

export async function createAndRunSimpleRun(input: CreateSimpleRunInput) {
  const context = await prepareSimpleRun(input);
  return runWithSimpleRunOwner(context.normalizedInput, () =>
    runSimpleRunWorkflow(context.run, context.normalizedInput, context.settings, context.startedAt),
  );
}

export async function startSimpleRun(input: CreateSimpleRunInput) {
  const context = await prepareSimpleRun(input);
  await enqueueSimpleRunQueueItem(context.run);
  ensureSimpleRunQueueWorker();
  return context.run;
}

export async function terminateSimpleRun(runId: string, reason = simpleRunForceTerminateMessage, account?: WorkspaceAccessActor) {
  const trimmedRunId = runId.trim();
  if (!trimmedRunId) throw new Error("Simple run id is required");

  const run = await getSimpleRunFromDb(trimmedRunId);
  if (!run || (account && !filterWorkspaceOwnedRecords([run], account).length)) throw new Error(`Simple run ${trimmedRunId} was not found.`);

  const message = reason.trim() || simpleRunForceTerminateMessage;
  await failSimpleRunQueueItemByRunId(run.id, message);

  const nextRun =
    run.status === "queued" ||
    run.status === "running" ||
    run.stages.some((stage) => stage.status === "running" || stage.status === "queued")
      ? buildInterruptedRun(run, message)
      : {
          ...run,
          errors: run.errors.includes(message) ? run.errors : [...run.errors, message],
          updatedAt: new Date().toISOString(),
        };

  await saveSimpleRunToDb(nextRun);
  await recordExecutionLog({
    scope: "simple/run",
    action: "Simple run force terminated",
    status: "error",
    message,
    details: {
      runId: run.id,
      previousStatus: run.status,
    },
    ownerUserId: run.ownerUserId || run.input.ownerUserId,
    ownerDisplayName: run.ownerDisplayName || run.input.ownerDisplayName,
  });

  ensureSimpleRunQueueWorker();
  return nextRun;
}

async function prepareSimpleRun(input: CreateSimpleRunInput) {
  const startedAt = Date.now();
  const normalizedInput = normalizeSimpleRunInput(input);
  const settings = input.settings ? await saveWorkspacePromptSettings(input.settings) : await getWorkspacePromptSettings();
  const run = makeInitialRun(normalizedInput, settings);
  await saveSimpleRunToDb(run);

  await recordExecutionLog({
    scope: "simple/run",
    action: "开始简单版全自动流程",
    status: "running",
    message: isSimpleRunLinkMode(normalizedInput)
      ? `关键词 ${normalizedInput.keyword}，导入链接 ${normalizedInput.links?.length || 0} 条，目标 ${normalizedInput.targetCount} 条`
      : `关键词 ${normalizedInput.keyword}，目标 ${normalizedInput.targetCount} 条，平台 ${normalizedInput.platforms.length} 个`,
    details: {
      runId: run.id,
      sourceMode: normalizedInput.sourceMode || "keyword",
      keyword: normalizedInput.keyword,
      targetCount: normalizedInput.targetCount,
      platforms: normalizedInput.platforms.join(","),
      linkCount: normalizedInput.links?.length || 0,
      linkPlatform: normalizedInput.linkPlatform || "",
      materialCount: normalizedInput.materialPaths.length,
      ownerUserId: normalizedInput.ownerUserId || "local",
    },
    ownerUserId: normalizedInput.ownerUserId,
    ownerDisplayName: normalizedInput.ownerDisplayName,
  });

  return {
    startedAt,
    normalizedInput,
    settings,
    run,
  };
}

type SimpleRunQueueGlobalState = typeof globalThis & {
  __fluxpostSimpleRunQueue?: {
    activeWorkers: number;
    sequence: number;
  };
};

const simpleRunQueueState = ((globalThis as SimpleRunQueueGlobalState).__fluxpostSimpleRunQueue ||= {
  activeWorkers: 0,
  sequence: 0,
});

function ensureSimpleRunQueueWorker() {
  while (simpleRunQueueState.activeWorkers < simpleRunQueueWorkerConcurrency) {
    simpleRunQueueState.activeWorkers += 1;
    simpleRunQueueState.sequence += 1;
    const workerId = `simple-worker-${process.pid}-${Date.now()}-${simpleRunQueueState.sequence}`;
    setTimeout(() => {
      void drainSimpleRunQueue(workerId).finally(() => {
        simpleRunQueueState.activeWorkers = Math.max(0, simpleRunQueueState.activeWorkers - 1);
      });
    }, 0);
  }
}

async function drainSimpleRunQueue(workerId: string) {
  while (true) {
    const item = await claimNextSimpleRunQueueItem(workerId, simpleRunQueueLockMs);
    if (!item) return;
    const heartbeat = setInterval(() => {
      void heartbeatSimpleRunQueueItem(item.id, workerId, simpleRunQueueLockMs).catch((error) =>
        console.warn(`Simple run queue heartbeat failed for ${item.runId}:`, error),
      );
    }, simpleRunQueueHeartbeatMs);

    const startedAt = Date.now();
    try {
      const run = await getSimpleRunFromDb(item.runId);
      if (!run) {
        throw new Error(`Simple run ${item.runId} no longer exists.`);
      }
      await runWithSimpleRunOwner(run.input, () => runSimpleRunWorkflow(run, run.input, settingsFromRun(run), startedAt));
      await completeSimpleRunQueueItem(item.id, workerId);
    } catch (error) {
      const message = compactError(error);
      await failInterruptedRun(item.runId, message, startedAt);
      await failSimpleRunQueueItem(item.id, workerId, message);
    } finally {
      clearInterval(heartbeat);
    }
  }
}

function settingsFromRun(run: SimpleRun): WorkspacePromptSettings {
  return {
    ...defaultWorkspacePromptSettings,
    textInstruction: run.textInstruction,
    imageWashPrompt: run.imageWashPrompt,
    imageStrategyPrompts: run.imageStrategyPrompts || defaultWorkspacePromptSettings.imageStrategyPrompts,
    imageSize: run.imageSize,
    imageQuality: run.imageQuality,
    platformCrawlSettings: run.platformCrawlSettings || defaultWorkspacePromptSettings.platformCrawlSettings,
    updatedAt: run.updatedAt,
  };
}

function isSimpleRunLinkMode(input: SimpleRunInput) {
  return input.sourceMode === "links";
}

function isSimpleRunFeishuMode(input: SimpleRunInput) {
  return input.sourceMode === "feishu";
}

function simpleRunAccessActor(input: SimpleRunInput) {
  return accessActorFromOwner(input.ownerUserId, input.ownerDisplayName);
}

function ensureSimpleRunOwner(run: SimpleRun): SimpleRun {
  if (run.ownerUserId || !run.input.ownerUserId) return run;
  return {
    ...run,
    ownerUserId: run.input.ownerUserId,
    ownerDisplayName: run.input.ownerDisplayName,
  };
}

function runWithSimpleRunOwner<T>(input: SimpleRunInput, operation: () => Promise<T>) {
  const access = simpleRunAccessActor(input);
  return access ? runWithExecutionLogOwner(access, operation) : operation();
}

async function runSimpleRunWorkflow(
  run: SimpleRun,
  normalizedInput: SimpleRunInput,
  settings: WorkspacePromptSettings,
  startedAt: number,
) {
  await assertSimpleRunNotForceTerminated(run.id);
  const crawledItems: NormalizedSourceItem[] = [];
  run = isSimpleRunFeishuMode(normalizedInput)
    ? await collectSimpleFeishuItems(run, crawledItems, normalizedInput)
    : isSimpleRunLinkMode(normalizedInput)
    ? await collectSimpleLinkItems(run, crawledItems, normalizedInput)
    : await collectSimpleKeywordItems(run, crawledItems, normalizedInput, settings);
  await assertSimpleRunNotForceTerminated(run.id);
  const safetyResult = await filterUnsafeSourceItems(crawledItems, {
    scope: "simple/run",
    query: normalizedInput.keyword,
    runId: run.id,
  });
  await assertSimpleRunNotForceTerminated(run.id);
  run = await applyUnsafeFilterPlatformCounts(run, safetyResult.filtered);
  if (isSimpleRunLinkMode(normalizedInput)) {
    run = await applyUnsafeFilterLinkResults(run, safetyResult.filtered);
    await syncSourceItemsToFeishu(safetyResult.items, { scope: "simple/run", sourceRunId: run.id });
    await assertSimpleRunNotForceTerminated(run.id);
  }
  if (isSimpleRunFeishuMode(normalizedInput)) {
    run = await applyUnsafeFilterFeishuResults(run, safetyResult.filtered);
  }
  const safeCrawledItems = dedupeItems(safetyResult.items).slice(0, normalizedInput.targetCount);

  run = await setStage(run, "crawl", {
    status: resolveStageTerminalStatus(run, "crawl"),
    message: `${isSimpleRunLinkMode(normalizedInput) || isSimpleRunFeishuMode(normalizedInput) ? "已导入" : "已采集"} ${crawledItems.length} 条候选内容`,
  });

  run = await setStage(run, "crawl", {
    message: `${isSimpleRunLinkMode(normalizedInput) || isSimpleRunFeishuMode(normalizedInput) ? "已导入" : "已采集"} ${crawledItems.length} 条候选内容，内容安全过滤 ${safetyResult.filtered.length} 条，保留 ${safeCrawledItems.length} 条`,
  });

  if (!safeCrawledItems.length) {
    run = await failRun(run, "没有采集到可生产的内容");
    return finishSimpleRun(run, startedAt);
  }

  const tagCandidates = safeCrawledItems;
  await assertSimpleRunNotForceTerminated(run.id);
  run = await setStage(run, "tag", {
    status: "running",
    total: tagCandidates.length,
    message: "正在为正文和前 9 张图/关键帧打标签",
  });

  let taggedItems: NormalizedSourceItem[] = [];
  try {
    taggedItems = await tagSourceItems(tagCandidates);
    await assertSimpleRunNotForceTerminated(run.id);
    const access = simpleRunAccessActor(normalizedInput);
    await ingestSimpleTaggedItems(normalizedInput, taggedItems, access);
    const taggedContent = taggedItems.filter((item) => item.contentTagging?.status === "success").length;
    const taggedVisual = taggedItems.reduce((sum, item) => sum + (item.visualTagging?.assets.length || 0), 0);
    run = {
      ...run,
      platformResults: run.platformResults.map((result) => {
        const platformItems = taggedItems.filter((item) => item.platform === result.platform);
        return {
          ...result,
          taggedContent: platformItems.filter((item) => item.contentTagging?.status === "success").length,
          taggedVisual: platformItems.reduce((sum, item) => sum + (item.visualTagging?.assets.length || 0), 0),
        };
      }),
    };
    run = await setStage(run, "tag", {
      status: "success",
      completed: taggedItems.length,
      failed: 0,
      message: `内容标签 ${taggedContent} 条，视觉标签 ${taggedVisual} 个`,
    });
  } catch (error) {
    const message = compactError(error);
    run = await setStage(run, "tag", {
      status: "error",
      failed: crawledItems.length,
      message,
    });
    run = await addRunError(run, message);
    return finishSimpleRun(run, startedAt);
  }

  const rankedProductionCandidates = taggedItems
    .map((item) => ({
      item: {
        ...item,
        productionPlan: item.productionPlan || buildProductionPlan(item),
      },
      score: item.hotScore || calculateHotScore(item),
    }))
    .sort((a, b) => b.score - a.score);
  const { productionItems, noMediaItems } = selectSimpleProductionItems(rankedProductionCandidates, normalizedInput.targetCount);

  await assertSimpleRunNotForceTerminated(run.id);
  run = await setStage(run, "produce", {
    status: "running",
    total: productionItems.length + noMediaItems.length,
    message: "正在逐条生成文案和配图",
  });

  const completedPosts: GeneratedPost[] = [];
  const produceRunUpdates = createRunUpdateQueue(run);
  for (const source of noMediaItems) {
    const message = describeSimpleProductionMediaSkip(source);
    await produceRunUpdates.update((latestRun) => incrementStage(latestRun, "produce", { skipped: 1 }, message));
    await recordExecutionLog({
      scope: "simple/run",
      action: "Simple production source skipped",
      status: "info",
      message,
      details: buildSimpleProductionMediaSkipDetails(run.id, source),
    });
  }
  await mapWithConcurrency(productionItems, concurrencyConfig.production, async (source) =>
    runWithConcurrencyPool("production", async () => {
    const plan = source.productionPlan || buildProductionPlan(source);
    if (plan.decision === "observe_only") {
      await produceRunUpdates.update((latestRun) => incrementStage(latestRun, "produce", { skipped: 1 }, plan.reason));
      return;
    }

    try {
      const imageTasks = buildSimpleImageTasks(source, settings);
      const draft = await generatePost({
        source,
        materialPaths: normalizedInput.materialPaths,
        instruction: settings.textInstruction,
        productionPlanOverride: {
          ...plan,
          promptGuidance: {
            ...plan.promptGuidance,
            textBrief: settings.textInstruction,
            imageBrief: [
              `汽车外观: ${settings.imageStrategyPrompts.carExterior}`,
              `车型美图: ${settings.imageStrategyPrompts.carExterior}`,
              `带文字图: ${settings.imageStrategyPrompts.textImage}`,
              `人车美图: ${settings.imageStrategyPrompts.peopleWithCar}`,
              "APP: 原图引用，不调用图片模型",
              "内饰空间: 原图引用，不调用图片模型",
            ].join("\n"),
          },
        },
        imageTasks,
      });

      const imagePrompt = resolveSimpleImagePrompt(draft, source);
      const imageResult = await generateImagesFromPrompt(imagePrompt, 1, draft.imageTasks, {
        size: settings.imageSize,
        quality: settings.imageQuality,
        taskConcurrency: concurrencyConfig.image,
      });
      const access = simpleRunAccessActor(normalizedInput);
      const post: GeneratedPost = applyWorkspaceOwner({
        ...draft,
        imagePrompt,
        imageUrls: imageResult.imageUrls,
        contentTags: source.contentTagging?.tags || [],
        imageTasks,
        aiNotes: [
          ...draft.aiNotes,
          imageResult.status === "completed"
            ? `简单版自动生成 ${imageResult.imageUrls.length} 张配图。`
            : imageResult.message || "图片模型未返回配图。",
        ],
        status: "draft",
        updatedAt: new Date().toISOString(),
      }, access, source);
      await savePost(post, access);
      await saveGeneratedPost(post, access);
      await produceRunUpdates.update(async (latestRun) => {
        const withPost = await addPostResult(latestRun, post);
        return incrementStage(withPost, "produce", { completed: 1 });
      });
      completedPosts.push(post);
      const sourceStatusWarning = await syncSimpleSourceStatus(post, access, run.id, "draft");
      if (sourceStatusWarning) {
        await produceRunUpdates.update((latestRun) => updatePostResultWarning(latestRun, post.id, sourceStatusWarning));
      }
    } catch (error) {
      const message = compactError(error);
      await produceRunUpdates.update(async (latestRun) => {
        const withStage = await incrementStage(latestRun, "produce", { failed: 1 }, message);
        return addRunError(withStage, `${source.id}: ${message}`);
      });
      await recordExecutionLog({
        scope: "simple/run",
        action: "简单版单条生产失败",
        status: "error",
        message,
        details: {
          runId: run.id,
          sourceItemId: source.id,
        },
      });
    }
    }),
  );
  await assertSimpleRunNotForceTerminated(run.id);
  run = produceRunUpdates.current();

  run = await setStage(run, "produce", {
    status: resolveStageTerminalStatus(run, "produce"),
    message: `已生成 ${completedPosts.length} 条图文草稿`,
  });

  if (!completedPosts.length) {
    run = await setStage(run, "publish", {
      status: "skipped",
      total: 0,
      message: "没有可写入飞书的图文",
    });
    run = await failRun(run, "没有成功生成可发布的图文");
    return finishSimpleRun(run, startedAt);
  }

  await assertSimpleRunNotForceTerminated(run.id);
  run = await setStage(run, "publish", {
    status: "running",
    total: completedPosts.length,
    message: "正在自动审核通过并提交飞书",
  });

  try {
    const approvedPosts = completedPosts.map((post) => ({
      ...post,
      status: "approved" as const,
      updatedAt: new Date().toISOString(),
    }));
    await assertSimpleRunNotForceTerminated(run.id);
    const access = simpleRunAccessActor(normalizedInput);
    const sourceStatusWarnings = await persistApprovedPostsForSimplePublish(approvedPosts, access, run.id);

    const publishJob = await enqueueFeishuPublishJob(approvedPosts, {
      source: "simple",
      sourceRunId: run.id,
      ownerUserId: run.input.ownerUserId || "local",
      ownerDisplayName: run.input.ownerDisplayName,
    });
    await assertSimpleRunNotForceTerminated(run.id);
    run = {
      ...run,
      posts: run.posts.map((post) => ({
        ...post,
        status: "approved",
        error: sourceStatusWarnings.get(post.postId) || post.error,
      })),
      publish: {
        status: "queued",
        postCount: approvedPosts.length,
        jobId: publishJob.id,
        message: `Feishu publish job ${publishJob.id} queued. Collection and generation workers are free while Feishu CLI writes run in order.`,
      },
    };
    run = await setStage(run, "publish", {
      status: "warning",
      completed: 0,
      failed: 0,
      message: `Feishu publish queued as ${publishJob.id}.`,
    });
  } catch (error) {
    const message = compactError(error);
    run = {
      ...run,
      publish: {
        status: "failed",
        postCount: completedPosts.length,
        error: message,
      },
    };
    run = await setStage(run, "publish", {
      status: "error",
      failed: completedPosts.length,
      message,
    });
    run = await addRunError(run, message);
  }

  return finishSimpleRun(run, startedAt);
}

async function reconcileInterruptedSimpleRuns(limit: number) {
  const runs = await readSimpleRunsFromDb(Math.max(limit, 50));
  const serverStartedAtMs = Date.now() - process.uptime() * 1000;
  const serverStartedAt = new Date(serverStartedAtMs).toISOString();

  for (const run of runs) {
    if (run.status !== "running" && run.status !== "queued") continue;
    const queuedWork = await getSimpleRunQueueItemByRunId(run.id);
    if (queuedWork?.status === "queued") continue;
    const lastUpdatedAtMs = Date.parse(run.updatedAt || run.createdAt);
    if (!Number.isFinite(lastUpdatedAtMs)) continue;
    if (lastUpdatedAtMs >= serverStartedAtMs) continue;

    const message = `Interrupted simple run: the local server process restarted at ${serverStartedAt} after this run was last updated. Please start a new run to retry.`;
    const nextRun = buildInterruptedRun(run, message);
    await saveSimpleRunToDb(nextRun);
    await failSimpleRunQueueItemByRunId(run.id, message);
    await recordExecutionLog({
      scope: "simple/run",
      action: "Interrupted simple run recovered",
      status: "error",
      message,
      details: {
        runId: run.id,
        previousStatus: run.status,
        serverStartedAt,
      },
    });
  }
}

async function failInterruptedRun(runId: string, message: string, startedAt: number) {
  const run = await getSimpleRunFromDb(runId);
  if (!run || (run.status !== "running" && run.status !== "queued")) return;
  const nextRun = buildInterruptedRun(run, message);
  await saveSimpleRunToDb(nextRun);
  await recordExecutionLog({
    scope: "simple/run",
    action: "Simple run background failure",
    status: "error",
    message,
    durationMs: Date.now() - startedAt,
    details: {
      runId,
    },
  });
}

function buildInterruptedRun(run: SimpleRun, message: string): SimpleRun {
  const now = new Date().toISOString();
  let markedStage = false;
  const stages = run.stages.map((stage) => {
    if (stage.status === "running" || (!markedStage && run.status === "queued" && stage.status === "queued")) {
      markedStage = true;
      const total = Number(stage.total || 0);
      const remaining = Math.max(total - Number(stage.completed || 0) - Number(stage.skipped || 0), 0);
      return {
        ...stage,
        status: "error" as const,
        failed: Math.max(Number(stage.failed || 0), remaining || 1),
        message,
        updatedAt: now,
      };
    }
    if (markedStage && stage.status === "queued") {
      return {
        ...stage,
        status: "skipped" as const,
        message: "Skipped because the simple run was interrupted.",
        updatedAt: now,
      };
    }
    return stage;
  });

  return {
    ...run,
    status: "failed",
    stages,
    errors: run.errors.includes(message) ? run.errors : [...run.errors, message],
    completedAt: now,
    updatedAt: now,
  };
}

function isSimpleRunForceTerminated(run: SimpleRun) {
  return run.errors.some((error) => error.includes("强制终止") || /force terminated/i.test(error));
}

async function getForceTerminatedSimpleRun(runId: string) {
  const currentRun = await getSimpleRunFromDb(runId);
  return currentRun && isSimpleRunForceTerminated(currentRun) ? currentRun : undefined;
}

async function assertSimpleRunNotForceTerminated(runId: string) {
  const terminatedRun = await getForceTerminatedSimpleRun(runId);
  if (terminatedRun) {
    throw new Error(simpleRunForceTerminateMessage);
  }
}

async function collectSimpleKeywordItems(
  run: SimpleRun,
  crawledItems: NormalizedSourceItem[],
  normalizedInput: SimpleRunInput,
  settings: WorkspacePromptSettings,
) {
  run = await setStage(run, "crawl", {
    status: "running",
    total: normalizedInput.platforms.length,
    message: "正在按平台调用 TikHub 并缓存媒体",
  });

  const perPlatformTarget = Math.max(1, Math.ceil(normalizedInput.targetCount / normalizedInput.platforms.length));
  const crawlRunUpdates = createRunUpdateQueue(run);
  await mapWithConcurrency(normalizedInput.platforms, concurrencyConfig.crawl, async (platform) => {
    try {
      const items = (await crawlTikHub(buildDefaultCrawlInput(platform, normalizedInput.keyword, perPlatformTarget, settings))).slice(0, perPlatformTarget);
      crawledItems.push(...items);
      await crawlRunUpdates.update(async (latestRun) => {
        const withPlatform = await addPlatformResult(latestRun, {
          platform,
          requested: perPlatformTarget,
          crawled: items.length,
          taggedContent: 0,
          taggedVisual: 0,
        });
        return incrementStage(withPlatform, "crawl", { completed: 1 });
      });
    } catch (error) {
      const message = compactError(error);
      await crawlRunUpdates.update(async (latestRun) => {
        const withPlatform = await addPlatformResult(latestRun, {
          platform,
          requested: perPlatformTarget,
          crawled: 0,
          taggedContent: 0,
          taggedVisual: 0,
          error: message,
        });
        return incrementStage(withPlatform, "crawl", { failed: 1 }, message);
      });
      await recordExecutionLog({
        scope: "simple/run",
        action: "简单版单平台采集失败",
        status: "error",
        message,
        details: {
          runId: run.id,
          platform,
        },
      });
    }
  });

  const nextRun = crawlRunUpdates.current();
  return topUpSimpleCrawlIfNeeded(nextRun, crawledItems, normalizedInput, settings, perPlatformTarget);
}

async function collectSimpleLinkItems(run: SimpleRun, crawledItems: NormalizedSourceItem[], normalizedInput: SimpleRunInput) {
  const links = normalizedInput.links || [];
  run = await setStage(run, "crawl", {
    status: "running",
    total: links.length,
    message: "正在解析来源链接并缓存媒体",
  });

  await recordExecutionLog({
    scope: "simple/run",
    action: "Simple run source-link import started",
    status: "running",
    message: `Resolving ${links.length} source link(s) for ${normalizedInput.keyword}.`,
    details: {
      runId: run.id,
      keyword: normalizedInput.keyword,
      linkCount: links.length,
      linkPlatform: normalizedInput.linkPlatform || "auto",
    },
  });

  const resolved = await resolveSourceLinks({
    links,
    platform: isSourceLinkPlatform(normalizedInput.linkPlatform) ? normalizedInput.linkPlatform : undefined,
  });
  crawledItems.push(...resolved.items);

  let nextRun = await saveRun({
    ...run,
    linkResults: resolved.results.map(toSimpleRunLinkResult),
    updatedAt: new Date().toISOString(),
  });

  const platformRequested = countLinkResultsByPlatform(resolved.results);
  const platformCrawled = countItemsByPlatform(resolved.items);
  for (const [platform, requested] of platformRequested) {
    nextRun = await addPlatformResult(nextRun, {
      platform,
      requested,
      crawled: platformCrawled.get(platform) || 0,
      taggedContent: 0,
      taggedVisual: 0,
    });
  }

  const failed = resolved.results.filter((result) => result.status === "failed").length;
  const skipped = resolved.results.filter((result) => result.status === "duplicate" || result.status === "unsupported").length;
  nextRun = await setStage(nextRun, "crawl", {
    total: resolved.total,
    completed: resolved.items.length,
    failed,
    skipped,
    message: `已解析 ${resolved.total} 条链接，获得 ${resolved.items.length} 条候选内容，重复/不支持 ${skipped} 条，失败 ${failed} 条`,
  });

  await recordExecutionLog({
    scope: "simple/run",
    action: "Simple run source-link import completed",
    status: resolved.items.length ? "success" : "error",
    message: `Resolved ${resolved.items.length}/${resolved.total} source link item(s) for ${normalizedInput.keyword}.`,
    details: {
      runId: nextRun.id,
      keyword: normalizedInput.keyword,
      total: resolved.total,
      valid: resolved.valid,
      resolvedItems: resolved.items.length,
      failed,
      skipped,
    },
  });

  return nextRun;
}

async function collectSimpleFeishuItems(run: SimpleRun, crawledItems: NormalizedSourceItem[], normalizedInput: SimpleRunInput) {
  const taskNumbers = normalizedInput.feishuTaskNumbers || [];
  run = await setStage(run, "crawl", {
    status: "running",
    total: taskNumbers.length,
    message: "正在按任务编号从飞书表导入内容",
  });

  await recordExecutionLog({
    scope: "simple/run",
    action: "Simple run Feishu task import started",
    status: "running",
    message: `Importing ${taskNumbers.length} Feishu task record(s).`,
    details: {
      runId: run.id,
      taskCount: taskNumbers.length,
    },
  });

  const imported = await importFeishuContentByTaskNumbers(taskNumbers);
  crawledItems.push(...imported.items);

  let nextRun = await saveRun({
    ...run,
    feishuResults: imported.results,
    updatedAt: new Date().toISOString(),
  });

  nextRun = await addPlatformResult(nextRun, {
    platform: "feishu",
    requested: imported.total,
    crawled: imported.items.length,
    taggedContent: 0,
    taggedVisual: 0,
    error: imported.imported ? undefined : "No Feishu task records were imported.",
  });

  nextRun = await setStage(nextRun, "crawl", {
    total: imported.total,
    completed: imported.imported,
    failed: imported.results.filter((result) => result.status === "failed").length,
    skipped: imported.results.filter((result) => result.status === "not_found").length,
    message: `飞书导入 ${imported.imported}/${imported.total} 条任务记录`,
  });

  await recordExecutionLog({
    scope: "simple/run",
    action: "Simple run Feishu task import completed",
    status: imported.imported ? "success" : "error",
    message: `Imported ${imported.imported}/${imported.total} Feishu task record(s).`,
    details: {
      runId: nextRun.id,
      total: imported.total,
      imported: imported.imported,
      failed: imported.failed,
    },
  });

  return nextRun;
}

function countLinkResultsByPlatform(results: SourceLinkImportResult[]) {
  const counts = new Map<Platform, number>();
  results.forEach((result) => {
    if (!result.platform) return;
    counts.set(result.platform, (counts.get(result.platform) || 0) + 1);
  });
  return counts;
}

function countItemsByPlatform(items: NormalizedSourceItem[]) {
  const counts = new Map<Platform, number>();
  items.forEach((item) => {
    counts.set(item.platform, (counts.get(item.platform) || 0) + 1);
  });
  return counts;
}

function toSimpleRunLinkResult(result: SourceLinkImportResult): SimpleRunLinkResult {
  return {
    url: result.url,
    platform: result.platform,
    status: result.status,
    sourceId: result.sourceId,
    itemId: result.itemId,
    title: result.title,
    error: result.error,
  };
}

async function applyUnsafeFilterLinkResults(run: SimpleRun, filteredItems: NormalizedSourceItem[]) {
  if (!run.linkResults?.length || !filteredItems.length) return run;
  const filteredIds = new Set(filteredItems.map((item) => item.id));
  return saveRun({
    ...run,
    linkResults: run.linkResults.map((result) =>
      result.itemId && filteredIds.has(result.itemId)
        ? {
            ...result,
            status: "filtered",
            error: "Filtered by source safety gate",
          }
        : result,
    ),
    updatedAt: new Date().toISOString(),
  });
}

async function applyUnsafeFilterFeishuResults(run: SimpleRun, filteredItems: NormalizedSourceItem[]) {
  if (!run.feishuResults?.length || !filteredItems.length) return run;
  const filteredIds = new Set(filteredItems.map((item) => item.id));
  return saveRun({
    ...run,
    feishuResults: run.feishuResults.map((result) =>
      result.itemId && filteredIds.has(result.itemId)
        ? {
            ...result,
            status: "failed",
            error: "Filtered by source safety gate",
          }
        : result,
    ),
    updatedAt: new Date().toISOString(),
  });
}

function buildDefaultCrawlInput(
  platform: CrawlPlatform,
  keyword: string,
  targetCount: number,
  settings: WorkspacePromptSettings,
): CrawlInput {
  const saved = settings.platformCrawlSettings?.[platform] || {};
  const fallbackSort =
    platform === "xiaohongshu" ? "popularity_descending" : platform === "weibo" ? "hot" : platform === "douyin" ? "0" : "relevance";
  const sort = saved.sort || fallbackSort;
  return {
    platform,
    query: keyword,
    targetCount,
    mode: saved.mode,
    sort,
    noteType: platform === "xiaohongshu" ? saved.noteType : undefined,
    searchType: platform === "weibo" ? saved.searchType || sort : undefined,
    includeType: platform === "weibo" ? saved.includeType || "all" : undefined,
    timeScope: platform === "weibo" ? saved.timeScope || undefined : undefined,
    contentType: platform === "douyin" ? saved.contentType || "0" : undefined,
  };
}

async function topUpSimpleCrawlIfNeeded(
  run: SimpleRun,
  crawledItems: NormalizedSourceItem[],
  input: SimpleRunInput,
  settings: WorkspacePromptSettings,
  perPlatformTarget: number,
) {
  let nextRun = run;

  for (const platform of input.platforms) {
    const missing = input.targetCount - dedupeItems(crawledItems).length;
    if (missing <= 0) break;

    const previous = nextRun.platformResults.find((result) => result.platform === platform);
    const previousRequested = previous?.requested || perPlatformTarget;
    const requested = previousRequested + missing;
    await recordExecutionLog({
      scope: "simple/run",
      action: "Simple run crawl top-up",
      status: "info",
      message: `Requesting ${platform} top-up for ${missing} missing candidate(s).`,
      details: {
        runId: nextRun.id,
        platform,
        previousRequested,
        requested,
        missing,
      },
    });

    try {
      const items = (await crawlTikHub(buildDefaultCrawlInput(platform, input.keyword, requested, settings))).slice(0, requested);
      crawledItems.push(...items);
      nextRun = await addPlatformResult(nextRun, {
        platform,
        requested,
        crawled: countUniquePlatformItems(crawledItems, platform),
        taggedContent: previous?.taggedContent || 0,
        taggedVisual: previous?.taggedVisual || 0,
      });
    } catch (error) {
      const message = compactError(error);
      nextRun = await addPlatformResult(nextRun, {
        platform,
        requested,
        crawled: countUniquePlatformItems(crawledItems, platform),
        taggedContent: previous?.taggedContent || 0,
        taggedVisual: previous?.taggedVisual || 0,
        error: message,
      });
      await recordExecutionLog({
        scope: "simple/run",
        action: "Simple run crawl top-up failed",
        status: "error",
        message,
        details: {
          runId: nextRun.id,
          platform,
          requested,
          missing,
        },
      });
    }
  }

  return nextRun;
}

function countUniquePlatformItems(items: NormalizedSourceItem[], platform: Platform) {
  return dedupeItems(items.filter((item) => item.platform === platform)).length;
}

async function ingestSimpleTaggedItems(
  input: SimpleRunInput,
  taggedItems: NormalizedSourceItem[],
  access: WorkspaceAccessActor | undefined,
) {
  if (!isSimpleRunFeishuMode(input)) {
    await ingestCrawlItems(input.keyword, taggedItems, access);
    return;
  }

  const grouped = groupFeishuItemsByVehicle(taggedItems, input.keyword);
  for (const [vehicle, items] of grouped) {
    await ingestCrawlItems(vehicle, items, access);
  }
}

function groupFeishuItemsByVehicle(items: NormalizedSourceItem[], fallbackKeyword: string) {
  const grouped = new Map<string, NormalizedSourceItem[]>();
  for (const item of items) {
    const vehicle = getFeishuItemVehicle(item) || fallbackKeyword || "飞书导入";
    grouped.set(vehicle, [...(grouped.get(vehicle) || []), item]);
  }
  return grouped;
}

function getFeishuItemVehicle(item: NormalizedSourceItem) {
  const raw = item.raw as { feishu?: { vehicle?: string } };
  return raw.feishu?.vehicle?.trim() || "";
}

async function applyUnsafeFilterPlatformCounts(run: SimpleRun, filteredItems: NormalizedSourceItem[]) {
  const filteredByPlatform = new Map<Platform, number>();
  filteredItems.forEach((item) => {
    filteredByPlatform.set(item.platform, (filteredByPlatform.get(item.platform) || 0) + 1);
  });
  return saveRun({
    ...run,
    platformResults: run.platformResults.map((result) => ({
      ...result,
      filteredUnsafe: filteredByPlatform.get(result.platform) || 0,
    })),
    updatedAt: new Date().toISOString(),
  });
}

function selectSimpleProductionItems(
  candidates: Array<{ item: NormalizedSourceItem; score: number }>,
  targetCount: number,
) {
  const productionItems: NormalizedSourceItem[] = [];
  const noMediaItems: NormalizedSourceItem[] = [];

  for (const { item } of candidates) {
    if (productionItems.length >= targetCount) break;
    if (!hasSimpleProductionVisualSource(item)) {
      noMediaItems.push(item);
      continue;
    }
    productionItems.push(item);
  }

  return { productionItems, noMediaItems };
}

function hasSimpleProductionVisualSource(source: NormalizedSourceItem) {
  if (hasSimpleProductionPickupRecordTag(source)) return false;
  if (isSimpleProductionVideoLikeSource(source)) return Boolean(source.videoFrames?.length);
  return Boolean((source.downloadedImages?.length || 0) > 0 || source.images.length > 0);
}

function hasSimpleProductionPickupRecordTag(source: NormalizedSourceItem) {
  return Boolean(source.contentTagging?.tags.includes("提车记录"));
}

function isSimpleProductionVideoLikeSource(source: NormalizedSourceItem) {
  return Boolean(
    source.mediaType === "video" ||
      source.mediaType === "mixed" ||
      source.videoUrl ||
      source.downloadedVideoUrl ||
      source.mediaCache?.videoPresent,
  );
}

function describeSimpleProductionMediaSkip(source: NormalizedSourceItem) {
  if (hasSimpleProductionPickupRecordTag(source)) return "Skipped pickup record source excluded from production.";
  if (isSimpleProductionVideoLikeSource(source)) return "Skipped video source without extracted video frames.";
  return "Skipped source without images, downloaded images, or video frames.";
}

function buildSimpleProductionMediaSkipDetails(runId: string, source: NormalizedSourceItem) {
  const downloadErrors = Array.from(new Set([...(source.downloadErrors || []), ...(source.mediaCache?.errors || [])]));
  return {
    runId,
    sourceItemId: source.id,
    platform: source.platform,
    mediaType: source.mediaType || "unknown",
    pickupRecord: hasSimpleProductionPickupRecordTag(source),
    contentTags: source.contentTagging?.tags?.join(",") || null,
    videoLike: isSimpleProductionVideoLikeSource(source),
    videoPresent: Boolean(source.videoUrl || source.downloadedVideoUrl || source.mediaCache?.videoPresent),
    localVideo: Boolean(source.downloadedVideoUrl || source.mediaCache?.localVideo),
    frameCount: source.videoFrames?.length || source.mediaCache?.frameCount || 0,
    sourceImageCount: source.images.length,
    localImageCount: source.downloadedImages?.length || 0,
    downloadErrorCount: downloadErrors.length,
    downloadErrors: downloadErrors.slice(0, 5).join(" | ") || null,
  };
}

function buildSimpleImageTasks(source: NormalizedSourceItem, settings: WorkspacePromptSettings): SourceImageTask[] {
  const tasks = buildDefaultImageTasks(source, settings.imageStrategyPrompts, { useComfyUiKlein: isComfyUiKleinConfigured() });
  return limitSimpleImageTasks(tasks);
}

function resolveSimpleImagePrompt(draft: GeneratedPost, source: NormalizedSourceItem) {
  const draftPrompt = draft.imagePrompt.trim();
  if (draftPrompt) return draftPrompt;

  const title = compactPromptText(draft.title || source.title, 120);
  const sourceTitle = compactPromptText(source.title, 120);
  const context = compactPromptText(draft.body || source.contentText, 360);

  return [
    "为这篇汽车社交媒体图文生成一张适合发布的配图。",
    title ? `图文标题: ${title}` : "",
    sourceTitle && sourceTitle !== title ? `原始内容标题: ${sourceTitle}` : "",
    context ? `正文/语境: ${context}` : "",
    "画面干净现代，突出智能电动车话题和社交媒体传播感；不要添加文字、水印、二维码或额外品牌露出。",
  ]
    .filter(Boolean)
    .join("\n");
}

function compactPromptText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function limitSimpleImageTasks(tasks: SourceImageTask[]) {
  let selectedCount = 0;
  return tasks.map((task) => {
    if (!task.selected) return task;
    selectedCount += 1;
    if (selectedCount <= maxSimpleImageTasksPerPost) return task;
    return {
      ...task,
      selected: false,
    };
  });
}

function normalizeSimpleRunInput(input: CreateSimpleRunInput): SimpleRunInput {
  const keyword = typeof input.keyword === "string" ? input.keyword.trim() : "";
  const sourceMode = input.sourceMode === "feishu" ? "feishu" : input.sourceMode === "links" ? "links" : "keyword";
  const platforms = Array.from(new Set((input.platforms || []).filter(isPlatform)));
  const links = normalizeSourceLinkInput(input.links);
  const feishuTaskNumbers = normalizeFeishuTaskNumberInput(input.feishuTaskNumbers);
  if (sourceMode !== "feishu" && !keyword) throw new Error("Keyword is required");
  if (sourceMode === "keyword" && !platforms.length) throw new Error("At least one platform is required");
  if (sourceMode === "links" && !links.length) throw new Error("At least one source link is required");
  if (sourceMode === "feishu" && !feishuTaskNumbers.length) throw new Error("At least one Feishu task number is required");
  const targetCountFallback = sourceMode === "feishu" ? feishuTaskNumbers.length : sourceMode === "links" ? links.length : 10;
  const targetCount = Math.min(Math.max(Number(input.targetCount || targetCountFallback), 1), maxSimpleRunItems);
  return {
    sourceMode,
    keyword: keyword || "飞书导入",
    platforms,
    targetCount:
      sourceMode === "feishu"
        ? Math.min(targetCount, feishuTaskNumbers.length)
        : sourceMode === "links"
          ? Math.min(targetCount, links.length)
          : targetCount,
    materialPaths: normalizeMaterialPaths(input.materialPaths),
    links: sourceMode === "links" ? links : undefined,
    linkPlatform: sourceMode === "links" ? normalizeLinkPlatform(input.linkPlatform) : undefined,
    feishuTaskNumbers: sourceMode === "feishu" ? feishuTaskNumbers : undefined,
    ownerUserId: normalizeOptionalOwnerValue(input.ownerUserId),
    ownerDisplayName: normalizeOptionalOwnerValue(input.ownerDisplayName),
  };
}

function normalizeSourceLinkInput(input: unknown) {
  const values = Array.isArray(input) ? input : typeof input === "string" ? input.split(/\r?\n/) : [];
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).slice(0, 200);
}

function normalizeLinkPlatform(value: unknown): SourceLinkPlatform | "auto" {
  return isSourceLinkPlatform(value) ? value : "auto";
}

function isSourceLinkPlatform(value: unknown): value is SourceLinkPlatform {
  return isPlatform(value) || value === "xiaopeng_bbs" || value === "dongchedi";
}

function normalizeMaterialPaths(input: unknown) {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeOptionalOwnerValue(input: unknown) {
  const value = typeof input === "string" ? input.trim() : "";
  return value ? value.slice(0, 96) : undefined;
}

function makeInitialRun(input: SimpleRunInput, settings: WorkspacePromptSettings): SimpleRun {
  const now = new Date().toISOString();
  return {
    id: `simple-${Date.now()}`,
    ownerUserId: input.ownerUserId,
    ownerDisplayName: input.ownerDisplayName,
    status: "queued",
    input,
    createdAt: now,
    updatedAt: now,
    textInstruction: settings.textInstruction,
    imageWashPrompt: settings.imageWashPrompt,
    imageStrategyPrompts: settings.imageStrategyPrompts,
    imageSize: settings.imageSize,
    imageQuality: settings.imageQuality,
    platformCrawlSettings: settings.platformCrawlSettings,
    stages: (Object.keys(stageTitles) as SimpleRunStageId[]).map((id) => makeStage(id, now)),
    platformResults: [],
    posts: [],
    errors: [],
  };
}

function makeStage(id: SimpleRunStageId, now: string): SimpleRunStage {
  return {
    id,
    title: stageTitles[id],
    status: "queued",
    total: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    updatedAt: now,
  };
}

async function setStage(run: SimpleRun, stageId: SimpleRunStageId, patch: Partial<Omit<SimpleRunStage, "id" | "title">>) {
  const now = new Date().toISOString();
  return saveRun({
    ...run,
    status: run.status === "queued" ? "running" : run.status,
    updatedAt: now,
    stages: run.stages.map((stage) =>
      stage.id === stageId
        ? {
            ...stage,
            ...patch,
            updatedAt: now,
          }
        : stage,
    ),
  });
}

async function incrementStage(
  run: SimpleRun,
  stageId: SimpleRunStageId,
  delta: Partial<Pick<SimpleRunStage, "completed" | "failed" | "skipped">>,
  message?: string,
) {
  const stage = run.stages.find((item) => item.id === stageId);
  if (!stage) return run;
  return setStage(run, stageId, {
    completed: stage.completed + (delta.completed || 0),
    failed: stage.failed + (delta.failed || 0),
    skipped: stage.skipped + (delta.skipped || 0),
    message: message || stage.message,
  });
}

function resolveStageTerminalStatus(run: SimpleRun, stageId: SimpleRunStageId): SimpleRunStageStatus {
  const stage = run.stages.find((item) => item.id === stageId);
  if (!stage) return "skipped";
  if (stage.failed && stage.completed) return "warning";
  if (stage.failed && !stage.completed) return "error";
  if (stage.completed || stage.skipped) return "success";
  return "skipped";
}

async function addPlatformResult(run: SimpleRun, result: SimpleRun["platformResults"][number]) {
  return saveRun({
    ...run,
    platformResults: [...run.platformResults.filter((item) => item.platform !== result.platform), result],
    errors: result.error ? [...run.errors, `${result.platform}: ${result.error}`] : run.errors,
    updatedAt: new Date().toISOString(),
  });
}

async function addPostResult(run: SimpleRun, post: GeneratedPost) {
  return saveRun({
    ...run,
    posts: [
      ...run.posts,
      {
        postId: post.id,
        sourceItemId: post.sourceItemId,
        platform: post.platform,
        title: post.title,
        status: post.status,
        imageCount: post.imageUrls.length,
        contentTags: post.contentTags || [],
      },
    ],
    updatedAt: new Date().toISOString(),
  });
}

async function updatePostResultWarning(run: SimpleRun, postId: string, message: string) {
  return saveRun({
    ...run,
    posts: run.posts.map((post) => (post.postId === postId ? { ...post, error: message } : post)),
    updatedAt: new Date().toISOString(),
  });
}

async function persistApprovedPostsForSimplePublish(
  posts: GeneratedPost[],
  access: WorkspaceAccessActor | undefined,
  runId: string,
) {
  const sourceStatusWarnings = new Map<string, string>();
  for (const post of posts) {
    await persistApprovedPostForSimplePublish(post, access);
    const warning = await syncSimpleSourceStatus(post, access, runId, "approved");
    if (warning) sourceStatusWarnings.set(post.id, warning);
  }
  return sourceStatusWarnings;
}

async function persistApprovedPostForSimplePublish(post: GeneratedPost, access: WorkspaceAccessActor | undefined) {
  await withSimpleRunTransientDatabaseRetry(async () => {
    await savePost(post, access);
    await saveGeneratedPost(post, access);
  });
}

async function withSimpleRunTransientDatabaseRetry(operation: () => Promise<void>) {
  for (let attempt = 1; attempt <= simpleRunPublishPersistMaxAttempts; attempt += 1) {
    try {
      await operation();
      return;
    } catch (error) {
      if (attempt >= simpleRunPublishPersistMaxAttempts || !isSimpleRunTransientDatabaseError(error)) throw error;
      await delaySimpleRunPublishPersistRetry(attempt);
    }
  }
}

function isSimpleRunTransientDatabaseError(error: unknown) {
  const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "";
  const message = error instanceof Error ? error.message : String(error || "");
  return code === "40P01" || code === "40001" || /\bdeadlock\b/i.test(message) || message.includes("死锁");
}

function delaySimpleRunPublishPersistRetry(attempt: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, simpleRunPublishPersistRetryDelayMs * attempt));
}

async function syncSimpleSourceStatus(post: GeneratedPost, access: WorkspaceAccessActor | undefined, runId: string, stage: "draft" | "approved") {
  try {
    await markSourceRewritten(post.sourceItemId, post, access);
    return undefined;
  } catch (error) {
    const message = compactError(error);
    await recordExecutionLog({
      scope: "simple/run",
      action: "Simple source status sync warning",
      status: "info",
      message,
      details: {
        runId,
        postId: post.id,
        sourceItemId: post.sourceItemId,
        postStatus: post.status,
        stage,
      },
    });
    return message;
  }
}

async function addRunError(run: SimpleRun, message: string) {
  return saveRun({
    ...run,
    errors: [...run.errors, message],
    updatedAt: new Date().toISOString(),
  });
}

async function failRun(run: SimpleRun, message: string) {
  const runWithError = await addRunError(run, message);
  return saveRun({
    ...runWithError,
    status: "failed",
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

async function finishSimpleRun(run: SimpleRun, startedAt: number) {
  const terminatedRun = await getForceTerminatedSimpleRun(run.id);
  if (terminatedRun) return terminatedRun;

  const status = run.status === "failed" ? run.status : resolveRunStatus(run);
  const finalRun = await saveRun({
    ...run,
    status,
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await recordExecutionLog({
    scope: "simple/run",
    action: "简单版全自动流程结束",
    status: status === "completed" ? "success" : status === "failed" ? "error" : "info",
    message: `生成 ${finalRun.posts.length} 条，发布状态 ${finalRun.publish?.status || "skipped"}`,
    durationMs: Date.now() - startedAt,
    details: {
      runId: finalRun.id,
      status,
      postCount: finalRun.posts.length,
      errorCount: finalRun.errors.length,
    },
  });
  return finalRun;
}

function resolveRunStatus(run: SimpleRun): SimpleRun["status"] {
  if (!run.posts.length) return "failed";
  if ((run.publish?.status === "queued" || run.publish?.status === "running") && !run.errors.length) return "completed";
  if (run.publish?.status === "published" && !run.errors.length) return "completed";
  return "partial";
}

async function saveRun(run: SimpleRun) {
  const terminatedRun = await getForceTerminatedSimpleRun(run.id);
  if (terminatedRun) return terminatedRun;

  await saveSimpleRunToDb(run);
  return run;
}

function createRunUpdateQueue(initialRun: SimpleRun) {
  let currentRun = initialRun;
  let queue = Promise.resolve();

  return {
    current: () => currentRun,
    async update(updater: (latestRun: SimpleRun) => Promise<SimpleRun>) {
      const next = queue.then(async () => {
        currentRun = await updater(currentRun);
        return currentRun;
      });
      queue = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
  };
}

function dedupeItems(items: NormalizedSourceItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function isPlatform(value: unknown): value is CrawlPlatform {
  return value === "wechat_channels" || value === "xiaohongshu" || value === "douyin" || value === "weibo";
}

function readBoundedIntegerEnv(envName: string, fallback: number, min: number, max: number) {
  const raw = process.env[envName];
  const value = raw === undefined || raw.trim() === "" ? fallback : Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), min), max);
}
