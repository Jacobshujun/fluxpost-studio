import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { compactError, recordExecutionLog } from "./activity-log";
import { appConfig } from "./config";
import { runWithConcurrencyPool } from "./concurrency";
import { resolveFeishuCliInvocation } from "./feishu-cli";
import { cacheCrawledMedia } from "./media-cache";
import type { NormalizedSourceItem, SimpleRunFeishuResult } from "./types";

const execFileAsync = promisify(execFile);

type CliResult = {
  stdout: string;
  stderr: string;
};

type FeishuContentImportFieldMap = {
  taskNumber: string;
  title: string;
  body: string;
  materials: string;
  vehicle: string;
};

type FeishuContentRecord = {
  recordId: string;
  fields: Record<string, unknown>;
};

type FeishuContentImportItemResult = SimpleRunFeishuResult;

export type FeishuContentImportResult = {
  status: "completed" | "partial" | "failed";
  total: number;
  imported: number;
  failed: number;
  results: FeishuContentImportItemResult[];
  items: NormalizedSourceItem[];
};

const defaultFieldMap: FeishuContentImportFieldMap = {
  taskNumber: "任务编号",
  title: "动态标题",
  body: "动态正文",
  materials: "动态素材",
  vehicle: "车型",
};

const maxTaskNumbersPerImport = 200;
const feishuRecordSearchKeywordMaxLength = 50;

export async function importFeishuContentByTaskNumbers(taskNumbers: string[]) {
  const startedAt = Date.now();
  const normalizedTaskNumbers = normalizeTaskNumbers(taskNumbers);
  if (!normalizedTaskNumbers.length) throw new Error("At least one Feishu task number is required");
  if (!appConfig.feishuCliBin || !appConfig.feishuContentImportBaseToken || !appConfig.feishuContentImportTableId) {
    throw new Error("Feishu content import needs FEISHU_CLI_BIN and Feishu Base table config.");
  }

  const fieldMap = getFeishuContentImportFieldMap();
  const results: FeishuContentImportItemResult[] = [];
  const importedItems: NormalizedSourceItem[] = [];

  for (const taskNumber of normalizedTaskNumbers) {
    try {
      const record = isLikelyRecordId(taskNumber)
        ? await getFeishuContentRecord(taskNumber, fieldMap)
        : await findFeishuContentRecordByTaskNumber(taskNumber, fieldMap);
      if (!record) {
        results.push({
          taskNumber,
          status: "not_found",
          error: "No exact Feishu record matched this task number.",
        });
        continue;
      }

      const item = await normalizeFeishuContentRecord(taskNumber, record, fieldMap);
      importedItems.push(item);
      results.push({
        taskNumber,
        status: "imported",
        recordId: record.recordId,
        itemId: item.id,
        vehicle: getFeishuVehicle(item),
        title: item.title,
        materialCount: (item.downloadedImages?.length || item.images.length) + (item.downloadedVideoUrl ? 1 : 0),
      });
    } catch (error) {
      results.push({
        taskNumber,
        status: "failed",
        error: compactCliError(error),
      });
    }
  }

  const cachedItems = importedItems.length ? await cacheCrawledMedia(importedItems) : [];
  const itemsById = new Map(cachedItems.map((item) => [item.id, item]));
  const finalResults = results.map((result) => {
    if (!result.itemId) return result;
    const item = itemsById.get(result.itemId);
    if (!item) return result;
    return {
      ...result,
      materialCount: (item.downloadedImages?.length || item.images.length) + (item.downloadedVideoUrl ? 1 : 0),
    };
  });
  const summary = buildImportResult(finalResults, cachedItems);

  await recordExecutionLog({
    scope: "feishu/content-import",
    action: "Feishu task-number content import",
    status: summary.imported ? "success" : "error",
    message: `Imported ${summary.imported}/${summary.total} Feishu task record(s).`,
    durationMs: Date.now() - startedAt,
    details: {
      total: summary.total,
      imported: summary.imported,
      failed: summary.failed,
    },
  });

  return summary;
}

export function normalizeFeishuTaskNumberInput(input: unknown) {
  return normalizeTaskNumbers(Array.isArray(input) ? input : typeof input === "string" ? splitTaskNumberText(input) : []);
}

function getFeishuContentImportFieldMap(): FeishuContentImportFieldMap {
  if (!appConfig.feishuContentImportFieldMap.trim()) return defaultFieldMap;

  try {
    const parsed = JSON.parse(appConfig.feishuContentImportFieldMap) as Record<string, unknown>;
    return {
      ...defaultFieldMap,
      ...Object.fromEntries(
        Object.entries(parsed)
          .filter(([, value]) => typeof value === "string" && value.trim())
          .map(([key, value]) => [key, (value as string).trim()]),
      ),
    };
  } catch (error) {
    throw new Error(`FEISHU_CONTENT_IMPORT_FIELD_MAP must be valid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`);
  }
}

async function findFeishuContentRecordByTaskNumber(taskNumber: string, fieldMap: FeishuContentImportFieldMap) {
  const payload = {
    keyword: compactRecordSearchKeyword(taskNumber),
    search_fields: [fieldMap.taskNumber],
    select_fields: [fieldMap.taskNumber, fieldMap.title, fieldMap.body, fieldMap.materials, fieldMap.vehicle],
    limit: 10,
  };
  const result = await runFeishuContentCli(
    [
      "base",
      "+record-search",
      "--as",
      "bot",
      "--base-token",
      appConfig.feishuContentImportBaseToken,
      "--table-id",
      appConfig.feishuContentImportTableId,
      "--format",
      "json",
      "--json",
      JSON.stringify(payload),
    ],
    60_000,
  );
  return findRecordWithExactTaskNumber(parseJsonOutput(result.stdout), fieldMap, taskNumber);
}

async function getFeishuContentRecord(recordId: string, fieldMap: FeishuContentImportFieldMap) {
  const result = await runFeishuContentCli(
    [
      "base",
      "+record-get",
      "--as",
      "bot",
      "--base-token",
      appConfig.feishuContentImportBaseToken,
      "--table-id",
      appConfig.feishuContentImportTableId,
      "--record-id",
      recordId,
      "--format",
      "json",
    ],
    60_000,
  );
  const parsed = parseJsonOutput(result.stdout);
  return findRecordById(parsed, recordId) || buildRecordFromObject(parsed, fieldMap, recordId);
}

async function normalizeFeishuContentRecord(
  requestedTaskNumber: string,
  record: FeishuContentRecord,
  fieldMap: FeishuContentImportFieldMap,
): Promise<NormalizedSourceItem> {
  const taskNumber = cellToText(record.fields[fieldMap.taskNumber]) || requestedTaskNumber || record.recordId;
  const vehicle = cellToText(record.fields[fieldMap.vehicle]);
  const title = cellToText(record.fields[fieldMap.title]);
  const body = cellToText(record.fields[fieldMap.body]);
  const materialTokens = extractFileTokens(record.fields[fieldMap.materials]);
  const materialRoot = path.join(process.cwd(), "public", "media", "crawl", "feishu", sanitizePathSegment(taskNumber));
  const publicRoot = `/media/crawl/feishu/${sanitizePathSegment(taskNumber)}`;

  if (materialTokens.length) {
    await mkdir(materialRoot, { recursive: true });
    for (const token of materialTokens) {
      await downloadFeishuAttachment(record.recordId, token, materialRoot);
    }
  }

  const materialFiles = await listDownloadedMaterialUrls(materialRoot, publicRoot);
  const images = materialFiles.filter((item) => item.kind === "image").map((item) => item.url);
  const videos = materialFiles.filter((item) => item.kind === "video").map((item) => item.url);
  const now = new Date().toISOString();
  const sourceId = taskNumber || record.recordId;

  return {
    id: `feishu-${sanitizePathSegment(sourceId)}-${hashString(record.recordId).slice(0, 6)}`,
    platform: "feishu",
    sourceId,
    mediaType: videos.length && images.length ? "mixed" : videos.length ? "video" : images.length ? "image" : body ? "text" : "unknown",
    sourceUrl: record.recordId,
    authorName: "飞书",
    title: title || body.slice(0, 80) || taskNumber,
    contentText: body || title,
    images,
    videoUrl: videos[0],
    mediaUrls: [record.recordId, ...images, ...videos].filter(Boolean),
    downloadedImages: images.length ? images : undefined,
    downloadedVideoUrl: videos[0],
    crawledAt: now,
    firstSeenAt: now,
    lastSeenAt: now,
    metrics: {},
    raw: {
      feishu: {
        recordId: record.recordId,
        taskNumber,
        vehicle,
      },
    },
  };
}

async function downloadFeishuAttachment(recordId: string, fileToken: string, outputDir: string) {
  await runFeishuContentCli(
    [
      "base",
      "+record-download-attachment",
      "--as",
      "bot",
      "--base-token",
      appConfig.feishuContentImportBaseToken,
      "--table-id",
      appConfig.feishuContentImportTableId,
      "--record-id",
      recordId,
      "--file-token",
      fileToken,
      "--output",
      toCliRelativePath(outputDir),
      "--overwrite",
    ],
    300_000,
  );
}

async function runFeishuContentCli(args: string[], timeout: number): Promise<CliResult> {
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

function findRecordWithExactTaskNumber(value: unknown, fieldMap: FeishuContentImportFieldMap, taskNumber: string) {
  const expected = taskNumber.trim();
  return findTableRecordWithExactTaskNumber(value, fieldMap, expected) || findObjectRecordWithExactTaskNumber(value, fieldMap, expected);
}

function findTableRecordWithExactTaskNumber(
  value: unknown,
  fieldMap: FeishuContentImportFieldMap,
  expected: string,
): FeishuContentRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findTableRecordWithExactTaskNumber(item, fieldMap, expected);
      if (result) return result;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const fields = Array.isArray(record.fields) && record.fields.every((item) => typeof item === "string") ? (record.fields as string[]) : null;
  const rows = Array.isArray(record.data) ? record.data : null;
  const recordIds = Array.isArray(record.record_id_list) && record.record_id_list.every((item) => typeof item === "string")
    ? (record.record_id_list as string[])
    : null;

  if (fields && rows && recordIds) {
    const taskIndex = fields.indexOf(fieldMap.taskNumber);
    if (taskIndex >= 0) {
      for (const [index, row] of rows.entries()) {
        if (!Array.isArray(row)) continue;
        const recordId = recordIds[index];
        if (!recordId?.startsWith("rec")) continue;
        if (!cellMatchesExact(row[taskIndex], expected)) continue;
        return {
          recordId,
          fields: Object.fromEntries(fields.map((field, fieldIndex) => [field, row[fieldIndex]])),
        };
      }
    }
  }

  for (const child of Object.values(record)) {
    const result = findTableRecordWithExactTaskNumber(child, fieldMap, expected);
    if (result) return result;
  }
  return undefined;
}

function findObjectRecordWithExactTaskNumber(
  value: unknown,
  fieldMap: FeishuContentImportFieldMap,
  expected: string,
): FeishuContentRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findObjectRecordWithExactTaskNumber(item, fieldMap, expected);
      if (result) return result;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const recordId = firstRecordId(record);
  const fields = objectRecordFields(record);
  if (recordId && cellMatchesExact(fields[fieldMap.taskNumber], expected)) {
    return { recordId, fields };
  }

  for (const child of Object.values(record)) {
    const result = findObjectRecordWithExactTaskNumber(child, fieldMap, expected);
    if (result) return result;
  }
  return undefined;
}

function findRecordById(value: unknown, recordId: string): FeishuContentRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findRecordById(item, recordId);
      if (result) return result;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (firstRecordId(record) === recordId) return { recordId, fields: objectRecordFields(record) };
  const fields = Array.isArray(record.fields) && record.fields.every((item) => typeof item === "string") ? (record.fields as string[]) : null;
  const rows = Array.isArray(record.data) ? record.data : null;
  const recordIds = Array.isArray(record.record_id_list) && record.record_id_list.every((item) => typeof item === "string")
    ? (record.record_id_list as string[])
    : null;
  if (fields && rows && recordIds) {
    const index = recordIds.indexOf(recordId);
    const row = index >= 0 ? rows[index] : undefined;
    if (Array.isArray(row)) return { recordId, fields: Object.fromEntries(fields.map((field, fieldIndex) => [field, row[fieldIndex]])) };
  }

  for (const child of Object.values(record)) {
    const result = findRecordById(child, recordId);
    if (result) return result;
  }
  return undefined;
}

function buildRecordFromObject(value: unknown, fieldMap: FeishuContentImportFieldMap, fallbackRecordId: string): FeishuContentRecord | undefined {
  const fields = objectRecordFields(value);
  if (
    fields[fieldMap.taskNumber] !== undefined ||
    fields[fieldMap.title] !== undefined ||
    fields[fieldMap.body] !== undefined ||
    fields[fieldMap.materials] !== undefined ||
    fields[fieldMap.vehicle] !== undefined
  ) {
    return {
      recordId: firstRecordId(value) || fallbackRecordId,
      fields,
    };
  }
  return undefined;
}

function objectRecordFields(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  if (record.fields && typeof record.fields === "object" && !Array.isArray(record.fields)) {
    return record.fields as Record<string, unknown>;
  }
  return record;
}

function cellMatchesExact(value: unknown, expected: string) {
  return flattenCellStrings(value).some((item) => item.trim() === expected);
}

function cellToText(value: unknown) {
  return Array.from(new Set(flattenPreferredCellText(value).map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean))).join("\n");
}

function flattenPreferredCellText(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flattenPreferredCellText);
  if (typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const preferred = ["text", "name", "value", "title"]
    .map((key) => record[key])
    .filter((item): item is string | number | boolean => typeof item === "string" || typeof item === "number" || typeof item === "boolean")
    .map(String);
  if (preferred.length) return preferred;
  return Object.values(record).flatMap(flattenPreferredCellText);
}

function flattenCellStrings(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flattenCellStrings);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(flattenCellStrings);
  return [];
}

function extractFileTokens(value: unknown) {
  const tokens: string[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const record = node as Record<string, unknown>;
    for (const key of ["file_token", "fileToken", "token"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) tokens.push(value.trim());
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return Array.from(new Set(tokens));
}

async function listDownloadedMaterialUrls(root: string, publicRoot: string) {
  if (!existsSync(root)) return [] as Array<{ url: string; kind: "image" | "video" }>;
  const entries = await listFilesRecursive(root);
  const materials: Array<{ url: string; kind: "image" | "video" }> = [];
  for (const filePath of entries) {
    const fileStat = await stat(filePath).catch(() => undefined);
    if (!fileStat?.size) continue;
    const extension = path.extname(filePath).toLowerCase();
    const kind = /\.(png|jpe?g|webp|gif)$/i.test(extension)
      ? "image"
      : /\.(mp4|mov)$/i.test(extension)
        ? "video"
        : undefined;
    if (!kind) continue;
    const relativePath = path.relative(root, filePath);
    materials.push({
      url: `${publicRoot}/${relativePath.split(path.sep).map(encodeURIComponent).join("/")}`,
      kind,
    });
  }
  return materials.sort((a, b) => a.url.localeCompare(b.url));
}

async function listFilesRecursive(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(child)));
    } else if (entry.isFile()) {
      files.push(child);
    }
  }
  return files;
}

function buildImportResult(results: FeishuContentImportItemResult[], items: NormalizedSourceItem[]): FeishuContentImportResult {
  const imported = results.filter((item) => item.status === "imported").length;
  const failed = results.length - imported;
  return {
    status: imported === results.length ? "completed" : imported ? "partial" : "failed",
    total: results.length,
    imported,
    failed,
    results,
    items,
  };
}

function getFeishuVehicle(item: NormalizedSourceItem) {
  const raw = item.raw as { feishu?: { vehicle?: string } };
  return raw.feishu?.vehicle || "";
}

function normalizeTaskNumbers(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => (typeof value === "string" ? splitTaskNumberText(value) : []))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).slice(0, maxTaskNumbersPerImport);
}

function splitTaskNumberText(value: string) {
  return value.split(/[\r\n,，;；\t ]+/).map((item) => item.trim()).filter(Boolean);
}

function compactRecordSearchKeyword(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= feishuRecordSearchKeywordMaxLength) return text;
  return text.slice(0, feishuRecordSearchKeywordMaxLength);
}

function parseJsonOutput(stdout: string) {
  if (!stdout.trim()) return {};
  return JSON.parse(stdout) as unknown;
}

function firstRecordId(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const id = record.record_id || record.recordId || record.id;
  return typeof id === "string" && id.startsWith("rec") ? id : undefined;
}

function isLikelyRecordId(value: string) {
  return /^rec[A-Za-z0-9]+$/.test(value.trim());
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 96) || "unknown";
}

function hashString(value: string) {
  return createHash("sha1").update(value).digest("hex");
}

function toCliRelativePath(filePath: string) {
  const relativePath = path.relative(process.cwd(), filePath);
  return relativePath.startsWith("..") ? filePath : `./${relativePath.replaceAll("\\", "/")}`;
}

function sanitizeCliError(error: unknown) {
  if (!(error instanceof Error)) return new Error("Feishu content import CLI failed with an unknown error.");
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
  for (const token of [appConfig.feishuContentImportBaseToken, appConfig.feishuBitableAppToken]) {
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
