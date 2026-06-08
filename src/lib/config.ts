import type { ConfigStatus } from "./types";
import { getDatabaseRuntimeStatus } from "./database";

export const appConfig = {
  tikhubBaseUrl: process.env.TIKHUB_BASE_URL || "https://api.tikhub.io",
  tikhubApiKey: process.env.TIKHUB_API_KEY || "",
  openaiBaseUrl: normalizeBaseUrl(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"),
  openaiTextBaseUrl: normalizeBaseUrl(process.env.OPENAI_TEXT_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"),
  openaiImageBaseUrl: normalizeBaseUrl(process.env.OPENAI_IMAGE_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"),
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiTextEndpoint: process.env.OPENAI_TEXT_ENDPOINT || "responses",
  openaiTextModel: process.env.OPENAI_TEXT_MODEL || "gpt-5.5",
  openaiImageEndpoint: process.env.OPENAI_IMAGE_ENDPOINT || "responses",
  openaiImageModel: process.env.OPENAI_IMAGE_MODEL || "nano-banana-pro",
  runningHubBaseUrl: normalizeBaseUrl(process.env.RUNNINGHUB_BASE_URL || "https://www.runninghub.cn"),
  runningHubApiKey: process.env.RUNNINGHUB_API_KEY || "",
  runningHubImageToImagePath: process.env.RUNNINGHUB_IMAGE_TO_IMAGE_PATH || "/openapi/v2/rhart-image-g-2/image-to-image",
  runningHubTextToImagePath: process.env.RUNNINGHUB_TEXT_TO_IMAGE_PATH || "/openapi/v2/rhart-image-g-2/text-to-image",
  runningHubQueryPath: process.env.RUNNINGHUB_QUERY_PATH || "/openapi/v2/query",
  runningHubUploadPath: process.env.RUNNINGHUB_UPLOAD_PATH || "/openapi/v2/media/upload/binary",
  runningHubTaskTimeoutMs: numberOrDefault(process.env.RUNNINGHUB_TASK_TIMEOUT_MS, 600_000),
  runningHubPollIntervalMs: numberOrDefault(process.env.RUNNINGHUB_POLL_INTERVAL_MS, 5_000),
  feishuCliBin: process.env.FEISHU_CLI_BIN || "",
  feishuCliArgs: process.env.FEISHU_CLI_BITABLE_ARGS || "",
  feishuBitableAppToken: process.env.FEISHU_BITABLE_APP_TOKEN || "",
  feishuBitableTableId: process.env.FEISHU_BITABLE_TABLE_ID || "",
  feishuBitableFieldMap: process.env.FEISHU_BITABLE_FIELD_MAP || "",
  feishuNotifyChatId: process.env.FEISHU_NOTIFY_CHAT_ID || "",
  feishuNotifyUserId: process.env.FEISHU_NOTIFY_USER_ID || "",
};

export function getConfigStatus(): ConfigStatus {
  const database = getDatabaseRuntimeStatus();
  return {
    tikhubConfigured: Boolean(appConfig.tikhubApiKey),
    openaiConfigured: Boolean(appConfig.openaiApiKey),
    runningHubConfigured: Boolean(appConfig.runningHubApiKey),
    feishuConfigured: Boolean(appConfig.feishuCliBin && appConfig.feishuBitableAppToken && appConfig.feishuBitableTableId),
    databaseBackend: database.backend,
    postgresConfigured: database.postgresConfigured,
    textModel: appConfig.openaiTextModel,
    imageModel: appConfig.openaiImageModel,
    imageProvider: appConfig.openaiImageEndpoint,
    openaiBaseUrl: appConfig.openaiBaseUrl,
    openaiTextBaseUrl: appConfig.openaiTextBaseUrl,
    openaiImageBaseUrl: appConfig.openaiImageBaseUrl,
    runningHubBaseUrl: appConfig.runningHubBaseUrl,
    tikhubBaseUrl: appConfig.tikhubBaseUrl,
    feishuCliBin: appConfig.feishuCliBin || undefined,
    feishuNotifyConfigured: Boolean(appConfig.feishuNotifyChatId || appConfig.feishuNotifyUserId),
  };
}

export function openaiUrl(path: string) {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return `${appConfig.openaiBaseUrl}/${cleanPath}`;
}

export function openaiTextUrl(path: string) {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return `${appConfig.openaiTextBaseUrl}/${cleanPath}`;
}

export function openaiImageUrl(path: string) {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return `${appConfig.openaiImageBaseUrl}/${cleanPath}`;
}

export function runningHubUrl(path: string) {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return `${appConfig.runningHubBaseUrl}/${cleanPath}`;
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function numberOrDefault(value: string | undefined, fallback: number) {
  const candidate = Number(value);
  return Number.isFinite(candidate) && candidate > 0 ? candidate : fallback;
}
