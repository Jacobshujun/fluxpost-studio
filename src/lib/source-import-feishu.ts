import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { compactError, recordExecutionLog } from "./activity-log";
import { appConfig } from "./config";
import { runWithConcurrencyPool } from "./concurrency";
import { resolveFeishuCliInvocation } from "./feishu-cli";
import type { NormalizedSourceItem, Platform } from "./types";

const execFileAsync = promisify(execFile);

export type SourceImportFeishuItemStatus = "created" | "skipped_duplicate" | "failed";

export type SourceImportFeishuItemResult = {
  sourceItemId: string;
  sourceUrl: string;
  platform: Platform;
  status: SourceImportFeishuItemStatus;
  recordId?: string;
  imageFileCount?: number;
  videoFileCount?: number;
  error?: string;
};

export type SourceImportFeishuSyncResult = {
  status: "disabled" | "needs_config" | "completed" | "partial" | "failed";
  total: number;
  created: number;
  skippedDuplicate: number;
  failed: number;
  results: SourceImportFeishuItemResult[];
  message: string;
};

type SourceImportFeishuOptions = {
  scope: string;
  sourceRunId?: string;
};

type SourceImportFieldMap = {
  sourceUrl: string;
  title: string;
  body: string;
  image: string;
  video: string;
  imageFieldId: string;
  videoFieldId: string;
  platform: string;
};

type CliResult = {
  stdout: string;
  stderr: string;
};

type SourceImportLink = {
  sourceUrl: string;
  searchKeyword: string;
  duplicateValues: string[];
};

type ExistingSourceRecord = {
  recordId: string;
  imageAttachmentCount: number;
  videoAttachmentCount: number;
};

const defaultFieldMap: SourceImportFieldMap = {
  sourceUrl: "源链接",
  title: "标题",
  body: "正文",
  image: "图片",
  video: "视频",
  imageFieldId: "fldMHwZDAf",
  videoFieldId: "fldt2fIaoG",
  platform: "平台",
};

const feishuWriteIntervalMs = 500;
const feishuRecordSearchKeywordMaxLength = 50;

export async function syncSourceItemsToFeishu(items: NormalizedSourceItem[], options: SourceImportFeishuOptions) {
  const startedAt = Date.now();
  const candidates = dedupeSourceItemsByLink(items);

  if (!candidates.length) {
    return buildSyncResult("completed", [], "No safe source-link items need Feishu source sync.");
  }

  if (!appConfig.feishuSourceImportEnabled) {
    const result = buildSyncResult("disabled", [], "Feishu source import sync is disabled.", candidates.length);
    await logSourceImportSync(result, options, startedAt);
    return result;
  }

  if (!appConfig.feishuCliBin || !appConfig.feishuSourceImportBaseToken || !appConfig.feishuSourceImportTableId) {
    const result = buildSyncResult(
      "needs_config",
      [],
      "Feishu source import sync needs CLI, Base token, and table id config.",
      candidates.length,
    );
    await logSourceImportSync(result, options, startedAt);
    return result;
  }

  let fieldMap: SourceImportFieldMap;
  try {
    fieldMap = getSourceImportFieldMap();
  } catch (error) {
    const result = buildSyncResult(
      "failed",
      [],
      `Feishu source import sync config error: ${compactCliError(error)}`,
      candidates.length,
    );
    await logSourceImportSync(result, options, startedAt);
    return result;
  }
  const results: SourceImportFeishuItemResult[] = [];

  for (const item of candidates) {
    const sourceLink = resolveSourceLinkForFeishu(item);
    if (!sourceLink) {
      results.push({
        sourceItemId: item.id,
        sourceUrl: "",
        platform: item.platform,
        status: "failed",
        error: "Source item has no source URL.",
      });
      continue;
    }

    const sourceUrl = sourceLink.sourceUrl;
    try {
      const existingRecord = await findExistingSourceRecord(sourceLink, fieldMap);
      if (existingRecord) {
        const imageFiles = existingRecord.imageAttachmentCount === 0 ? resolveSourceImageAttachmentFiles(item) : [];
        const videoFiles = existingRecord.videoAttachmentCount === 0 ? resolveSourceVideoAttachmentFiles(item) : [];

        if (imageFiles.length) {
          await uploadAttachmentFiles(existingRecord.recordId, fieldMap.imageFieldId, imageFiles);
          await sleep(feishuWriteIntervalMs);
        }
        if (videoFiles.length) {
          await uploadAttachmentFiles(existingRecord.recordId, fieldMap.videoFieldId, videoFiles);
          await sleep(feishuWriteIntervalMs);
        }

        results.push({
          sourceItemId: item.id,
          sourceUrl,
          platform: item.platform,
          status: "skipped_duplicate",
          recordId: existingRecord.recordId,
          imageFileCount: imageFiles.length,
          videoFileCount: videoFiles.length,
        });
        continue;
      }

      const recordId = await createSourceRecord(item, sourceUrl, fieldMap);
      const imageFiles = resolveSourceImageAttachmentFiles(item);
      const videoFiles = resolveSourceVideoAttachmentFiles(item);

      if (imageFiles.length) {
        await uploadAttachmentFiles(recordId, fieldMap.imageFieldId, imageFiles);
        await sleep(feishuWriteIntervalMs);
      }
      if (videoFiles.length) {
        await uploadAttachmentFiles(recordId, fieldMap.videoFieldId, videoFiles);
        await sleep(feishuWriteIntervalMs);
      }

      results.push({
        sourceItemId: item.id,
        sourceUrl,
        platform: item.platform,
        status: "created",
        recordId,
        imageFileCount: imageFiles.length,
        videoFileCount: videoFiles.length,
      });
      await sleep(feishuWriteIntervalMs);
    } catch (error) {
      results.push({
        sourceItemId: item.id,
        sourceUrl,
        platform: item.platform,
        status: "failed",
        error: compactCliError(error),
      });
    }
  }

  const result = buildSyncResult(resolveSyncStatus(results), results, formatSyncMessage(results));
  await logSourceImportSync(result, options, startedAt);
  return result;
}

function getSourceImportFieldMap(): SourceImportFieldMap {
  if (!appConfig.feishuSourceImportFieldMap.trim()) return defaultFieldMap;

  try {
    const parsed = JSON.parse(appConfig.feishuSourceImportFieldMap) as Record<string, unknown>;
    const merged = {
      ...defaultFieldMap,
      ...Object.fromEntries(
        Object.entries(parsed)
          .filter(([, value]) => typeof value === "string" && value.trim())
          .map(([key, value]) => [key, value as string]),
      ),
    };
    return {
      ...merged,
      imageFieldId: resolveAttachmentFieldId(parsed.imageFieldId, parsed.image, defaultFieldMap.imageFieldId),
      videoFieldId: resolveAttachmentFieldId(parsed.videoFieldId, parsed.video, defaultFieldMap.videoFieldId),
    };
  } catch (error) {
    throw new Error(`FEISHU_SOURCE_IMPORT_FIELD_MAP must be valid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`);
  }
}

function resolveAttachmentFieldId(configuredId: unknown, configuredNameOrId: unknown, fallback: string) {
  if (typeof configuredId === "string" && configuredId.trim()) return configuredId.trim();
  if (typeof configuredNameOrId === "string" && /^fld[A-Za-z0-9]+$/.test(configuredNameOrId.trim())) return configuredNameOrId.trim();
  return fallback;
}

async function findExistingSourceRecord(sourceLink: SourceImportLink, fieldMap: SourceImportFieldMap) {
  const payload = {
    keyword: sourceLink.searchKeyword,
    search_fields: [fieldMap.sourceUrl],
    select_fields: [fieldMap.sourceUrl, fieldMap.image, fieldMap.video],
    limit: 10,
  };
  const result = await runSourceImportFeishuCli(
    [
      "base",
      "+record-search",
      "--as",
      "bot",
      "--base-token",
      appConfig.feishuSourceImportBaseToken,
      "--table-id",
      appConfig.feishuSourceImportTableId,
      "--format",
      "json",
      "--json",
      JSON.stringify(payload),
    ],
    60_000,
  );
  const parsed = parseJsonOutput(result.stdout);
  return findExistingSourceRecordWithAnyExactFieldValue(parsed, fieldMap, sourceLink.duplicateValues);
}

async function createSourceRecord(item: NormalizedSourceItem, sourceUrl: string, fieldMap: SourceImportFieldMap) {
  const payloadPath = await writeSourceRecordPayload(item, sourceUrl, fieldMap);
  const result = await runSourceImportFeishuCli(
    [
      "base",
      "+record-batch-create",
      "--as",
      "bot",
      "--base-token",
      appConfig.feishuSourceImportBaseToken,
      "--table-id",
      appConfig.feishuSourceImportTableId,
      "--json",
      `@${toCliRelativePath(payloadPath)}`,
    ],
    120_000,
  );
  const recordId = parseCreatedSourceRecordIds(result.stdout)[0];
  if (!recordId) throw new Error("Feishu source record creation did not return a record ID.");
  return recordId;
}

async function writeSourceRecordPayload(item: NormalizedSourceItem, sourceUrl: string, fieldMap: SourceImportFieldMap) {
  const outboxDir = path.join(process.cwd(), "data", "feishu-outbox");
  await mkdir(outboxDir, { recursive: true });
  const payloadPath = path.join(outboxDir, `source-import-record-${Date.now()}-${hashString(sourceUrl)}.json`);
  const payload = {
    fields: [fieldMap.sourceUrl, fieldMap.title, fieldMap.body, fieldMap.platform],
    rows: [
      [
        sourceUrl,
        resolveSourceTitle(item),
        resolveSourceBody(item),
        formatPlatform(item.platform),
      ],
    ],
  };
  await writeFile(payloadPath, JSON.stringify(payload, null, 2), "utf8");
  return payloadPath;
}

async function uploadAttachmentFiles(recordId: string, fieldId: string, files: string[]) {
  const uniqueFiles = Array.from(new Set(files)).slice(0, 50);
  if (!uniqueFiles.length) return;
  await runSourceImportFeishuCli(
    [
      "base",
      "+record-upload-attachment",
      "--as",
      "bot",
      "--base-token",
      appConfig.feishuSourceImportBaseToken,
      "--table-id",
      appConfig.feishuSourceImportTableId,
      "--record-id",
      recordId,
      "--field-id",
      fieldId,
      ...uniqueFiles.flatMap((file) => ["--file", file]),
    ],
    300_000,
  );
}

async function runSourceImportFeishuCli(args: string[], timeout: number): Promise<CliResult> {
  const invocation = resolveFeishuCliInvocation(appConfig.feishuCliBin);
  return runWithConcurrencyPool("feishu", async () => {
    try {
      const result = await execFileAsync(invocation.file, [...invocation.argsPrefix, ...args], {
        timeout,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 8,
        env: buildCliEnv(process.env),
      });
      return {
        stdout: typeof result.stdout === "string" ? result.stdout : String(result.stdout || ""),
        stderr: typeof result.stderr === "string" ? result.stderr : String(result.stderr || ""),
      };
    } catch (error) {
      throw sanitizeCliError(error);
    }
  });
}

function resolveSourceImageAttachmentFiles(item: NormalizedSourceItem) {
  const urls = item.videoFrames?.length
    ? item.videoFrames.map((frame) => frame.url)
    : item.downloadedImages?.length
      ? item.downloadedImages
      : [];
  return urls.map(resolveLocalPublicFile).filter((file): file is string => Boolean(file));
}

function resolveSourceVideoAttachmentFiles(item: NormalizedSourceItem) {
  return [item.downloadedVideoUrl, item.videoUrl]
    .map((url) => (url ? resolveLocalPublicFile(url) : null))
    .filter((file): file is string => Boolean(file))
    .slice(0, 1);
}

function resolveLocalPublicFile(url: string) {
  if (!url || /^https?:\/\//i.test(url)) return null;

  const cleanUrl = url.split(/[?#]/, 1)[0];
  const publicRoot = path.join(process.cwd(), "public");
  const candidates = cleanUrl.startsWith("/") || cleanUrl.startsWith("\\")
    ? [path.join(publicRoot, stripPublicPathPrefix(cleanUrl))]
    : path.isAbsolute(cleanUrl)
      ? [cleanUrl]
      : [path.join(publicRoot, stripPublicPathPrefix(cleanUrl))];

  const filePath = candidates.find((candidate) => isPathInside(candidate, publicRoot) && existsSync(candidate));
  if (!filePath) return null;
  return toCliRelativePath(filePath);
}

function stripPublicPathPrefix(value: string) {
  return value.replace(/^[\\/]+/, "").replace(/^public[\\/]+/i, "");
}

function isPathInside(filePath: string, parentPath: string) {
  const relativePath = path.relative(parentPath, filePath);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function resolveSourceTitle(item: NormalizedSourceItem) {
  return compactText(item.title, 240) || "";
}

function resolveSourceBody(item: NormalizedSourceItem) {
  return item.contentText?.trim() || item.title?.trim() || "";
}

function resolveSourceUrl(item: NormalizedSourceItem) {
  return item.sourceUrl?.trim() || "";
}

function resolveSourceLinkForFeishu(item: NormalizedSourceItem): SourceImportLink | null {
  const rawSourceUrl = resolveSourceUrl(item);
  const canonicalUrl = resolveCanonicalSourceUrl(item);
  const sourceUrl = canonicalUrl || rawSourceUrl;
  if (!sourceUrl) return null;

  const searchKeyword = resolveSourceRecordSearchKeyword(item, sourceUrl, rawSourceUrl);
  if (!searchKeyword) return null;

  return {
    sourceUrl,
    searchKeyword,
    duplicateValues: dedupeStrings([sourceUrl, rawSourceUrl]),
  };
}

function resolveCanonicalSourceUrl(item: NormalizedSourceItem) {
  const sourceId = compactSourceId(item.sourceId);
  if (!sourceId) return "";

  if (item.platform === "douyin" && /^\d{5,}$/.test(sourceId)) {
    return `https://www.douyin.com/note/${sourceId}`;
  }

  if (item.platform === "xiaohongshu" && /^[A-Za-z0-9]{8,}$/.test(sourceId) && !sourceId.startsWith("xiaohongshu-")) {
    return `https://www.xiaohongshu.com/explore/${sourceId}`;
  }

  if (item.platform === "weibo" && /^[A-Za-z0-9]+$/.test(sourceId) && !sourceId.startsWith("weibo-")) {
    return `https://weibo.com/detail/${sourceId}`;
  }

  if (item.platform === "xiaopeng_bbs" && /^\d{4,20}$/.test(sourceId)) {
    return `https://bbs.xiaopeng.com/thread/${sourceId}?tidType=1`;
  }

  if (item.platform === "dongchedi" && /^\d{8,24}$/.test(sourceId)) {
    return `https://www.dongchedi.com/ugc/article/${sourceId}`;
  }

  return "";
}

function resolveSourceRecordSearchKeyword(item: NormalizedSourceItem, sourceUrl: string, rawSourceUrl: string) {
  const candidates = [
    compactSourceId(item.sourceId),
    extractLikelyContentId(sourceUrl),
    extractLikelyContentId(rawSourceUrl),
    sourceUrl,
    rawSourceUrl,
  ];

  for (const candidate of candidates) {
    const keyword = compactRecordSearchKeyword(candidate);
    if (keyword) return keyword;
  }
  return "";
}

function compactRecordSearchKeyword(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= feishuRecordSearchKeywordMaxLength) return text;

  const contentId = extractLikelyContentId(text);
  if (contentId && contentId.length <= feishuRecordSearchKeywordMaxLength) return contentId;

  return text.slice(0, feishuRecordSearchKeywordMaxLength);
}

function compactSourceId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function extractLikelyContentId(value: string) {
  const text = value.trim();
  if (!text) return "";
  const numericMatches = Array.from(text.matchAll(/\d{8,}/g)).map((match) => match[0]);
  if (numericMatches.length) return numericMatches.sort((a, b) => b.length - a.length)[0];

  const xiaohongshuMatch = text.match(/(?:explore|discovery\/item)\/([A-Za-z0-9]{8,})/i);
  if (xiaohongshuMatch?.[1]) return xiaohongshuMatch[1];

  return "";
}

function formatPlatform(platform: Platform) {
  const labels: Record<Platform, string> = {
    douyin: "抖音",
    weibo: "微博",
    xiaohongshu: "小红书",
    wechat_channels: "视频号",
    feishu: "飞书",
    xiaopeng_bbs: "小鹏社区",
    dongchedi: "\u61c2\u8f66\u5e1d",
  };
  return labels[platform];
}

function dedupeSourceItemsByLink(items: NormalizedSourceItem[]) {
  const seen = new Set<string>();
  const deduped: NormalizedSourceItem[] = [];
  for (const item of items) {
    const sourceUrl = resolveSourceLinkForFeishu(item)?.sourceUrl || "";
    if (!sourceUrl || seen.has(sourceUrl)) continue;
    seen.add(sourceUrl);
    deduped.push(item);
  }
  return deduped;
}

function buildSyncResult(
  status: SourceImportFeishuSyncResult["status"],
  results: SourceImportFeishuItemResult[],
  message: string,
  total = results.length,
): SourceImportFeishuSyncResult {
  return {
    status,
    total,
    created: results.filter((item) => item.status === "created").length,
    skippedDuplicate: results.filter((item) => item.status === "skipped_duplicate").length,
    failed: results.filter((item) => item.status === "failed").length,
    results,
    message,
  };
}

function resolveSyncStatus(results: SourceImportFeishuItemResult[]): SourceImportFeishuSyncResult["status"] {
  if (!results.length) return "completed";
  if (results.every((item) => item.status === "failed")) return "failed";
  return results.some((item) => item.status === "failed") ? "partial" : "completed";
}

function formatSyncMessage(results: SourceImportFeishuItemResult[]) {
  const created = results.filter((item) => item.status === "created").length;
  const skipped = results.filter((item) => item.status === "skipped_duplicate").length;
  const failed = results.filter((item) => item.status === "failed").length;
  return `Feishu source import sync completed: created=${created}, skippedDuplicate=${skipped}, failed=${failed}.`;
}

async function logSourceImportSync(result: SourceImportFeishuSyncResult, options: SourceImportFeishuOptions, startedAt: number) {
  const firstFailure = result.results.find((item) => item.status === "failed");
  await recordExecutionLog({
    scope: options.scope,
    action: "Feishu source import sync",
    status: result.status === "failed" || result.status === "partial" ? "error" : result.status === "completed" ? "success" : "info",
    message: result.message,
    durationMs: Date.now() - startedAt,
    details: {
      sourceRunId: options.sourceRunId || null,
      total: result.total,
      created: result.created,
      skippedDuplicate: result.skippedDuplicate,
      failed: result.failed,
      firstFailedSourceItemId: firstFailure?.sourceItemId || null,
      firstFailedSourceError: firstFailure?.error ? compactText(firstFailure.error, 240) : null,
    },
  });
}

function parseJsonOutput(stdout: string) {
  if (!stdout.trim()) return {};
  return JSON.parse(stdout) as unknown;
}

function parseCreatedSourceRecordIds(stdout: string) {
  const parsed = parseJsonOutput(stdout);
  return findStringArray(parsed, "record_id_list") || findRecordIds(parsed);
}

function findExistingSourceRecordWithAnyExactFieldValue(
  value: unknown,
  fieldMap: SourceImportFieldMap,
  expectedValues: string[],
): ExistingSourceRecord | undefined {
  const expected = new Set(expectedValues.map((item) => item.trim()).filter(Boolean));
  return findTableRecordWithExpectedFieldValue(value, fieldMap, expected) || findObjectRecordWithExpectedFieldValue(value, fieldMap, expected);
}

function findTableRecordWithExpectedFieldValue(
  value: unknown,
  fieldMap: SourceImportFieldMap,
  expected: Set<string>,
): ExistingSourceRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findTableRecordWithExpectedFieldValue(item, fieldMap, expected);
      if (result) return result;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const fields = Array.isArray(record.fields) && record.fields.every((item) => typeof item === "string") ? record.fields : null;
  const rows = Array.isArray(record.data) ? record.data : null;
  const recordIds = Array.isArray(record.record_id_list) && record.record_id_list.every((item) => typeof item === "string")
    ? (record.record_id_list as string[])
    : null;

  if (fields && rows && recordIds) {
    const sourceIndex = fields.indexOf(fieldMap.sourceUrl);
    const imageIndex = fields.indexOf(fieldMap.image);
    const videoIndex = fields.indexOf(fieldMap.video);
    if (sourceIndex >= 0) {
      for (const [index, row] of rows.entries()) {
        if (!Array.isArray(row)) continue;
        const recordId = recordIds[index];
        if (!recordId?.startsWith("rec")) continue;
        const sourceValues = flattenCellStrings(row[sourceIndex]);
        if (!sourceValues.some((item) => expected.has(item.trim()))) continue;
        return {
          recordId,
          imageAttachmentCount: imageIndex >= 0 ? countAttachmentCell(row[imageIndex]) : 0,
          videoAttachmentCount: videoIndex >= 0 ? countAttachmentCell(row[videoIndex]) : 0,
        };
      }
    }
  }

  for (const child of Object.values(record)) {
    const result = findTableRecordWithExpectedFieldValue(child, fieldMap, expected);
    if (result) return result;
  }
  return undefined;
}

function findObjectRecordWithExpectedFieldValue(
  value: unknown,
  fieldMap: SourceImportFieldMap,
  expected: Set<string>,
): ExistingSourceRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findObjectRecordWithExpectedFieldValue(item, fieldMap, expected);
      if (result) return result;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const id = firstRecordId(record);
  const fieldValues = extractFieldStrings(record, fieldMap.sourceUrl);
  if (id && fieldValues.some((item) => expected.has(item.trim()))) {
    return {
      recordId: id,
      imageAttachmentCount: countNamedAttachmentCell(record, fieldMap.image),
      videoAttachmentCount: countNamedAttachmentCell(record, fieldMap.video),
    };
  }

  for (const child of Object.values(record)) {
    const result = findObjectRecordWithExpectedFieldValue(child, fieldMap, expected);
    if (result) return result;
  }
  return undefined;
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function extractFieldStrings(record: Record<string, unknown>, fieldName: string) {
  const fields = typeof record.fields === "object" && record.fields ? (record.fields as Record<string, unknown>) : {};
  return flattenCellStrings(record[fieldName]).concat(flattenCellStrings(fields[fieldName]));
}

function flattenCellStrings(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flattenCellStrings);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(flattenCellStrings);
  return [];
}

function countNamedAttachmentCell(record: Record<string, unknown>, fieldName: string) {
  const fields = typeof record.fields === "object" && record.fields ? (record.fields as Record<string, unknown>) : {};
  return Math.max(countAttachmentCell(record[fieldName]), countAttachmentCell(fields[fieldName]));
}

function countAttachmentCell(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null && item !== "").length;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.file_token === "string" || typeof record.token === "string") return 1;
    return Object.values(record).reduce<number>((sum, item) => sum + countAttachmentCell(item), 0);
  }
  return 0;
}

function findStringArray(value: unknown, key: string): string[] | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findStringArray(item, key);
      if (result) return result;
    }
    return null;
  }
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
  if (Array.isArray(value)) return value.flatMap(findRecordIds);
  const record = value as Record<string, unknown>;
  const current = firstRecordId(record);
  return [...(current ? [current] : []), ...Object.values(record).flatMap(findRecordIds)];
}

function firstRecordId(record: Record<string, unknown>) {
  const id = record.record_id || record.recordId || record.id;
  return typeof id === "string" && id.startsWith("rec") ? id : undefined;
}

function compactText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function toCliRelativePath(filePath: string) {
  const relativePath = path.relative(process.cwd(), filePath);
  return relativePath.startsWith("..") ? filePath : `./${relativePath.replaceAll("\\", "/")}`;
}

function sanitizeCliError(error: unknown) {
  if (!(error instanceof Error)) return new Error("Feishu source import CLI failed with an unknown error.");
  const next = new Error(sanitizeCliText(error.message));
  const source = error as Error & { stdout?: string; stderr?: string; code?: unknown; signal?: unknown };
  const target = next as Error & { stdout?: string; stderr?: string; code?: unknown; signal?: unknown };
  if (typeof source.stdout === "string") target.stdout = sanitizeCliText(source.stdout);
  if (typeof source.stderr === "string") target.stderr = sanitizeCliText(source.stderr);
  if (source.code !== undefined) target.code = source.code;
  if (source.signal !== undefined) target.signal = source.signal;
  return next;
}

function compactCliError(error: unknown) {
  return error instanceof Error ? sanitizeCliText(error.message) : compactError(error);
}

function sanitizeCliText(value: string) {
  let next = value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer ***").replace(/(--base-token\s+)(\S+)/gi, "$1***");
  for (const token of [appConfig.feishuSourceImportBaseToken, appConfig.feishuBitableAppToken]) {
    if (token) next = next.replaceAll(token, "***");
  }
  return next;
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

function hashString(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
