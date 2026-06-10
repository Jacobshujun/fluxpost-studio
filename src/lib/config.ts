import type { ConfigStatus } from "./types";
import { getDatabaseRuntimeStatus } from "./database";

export const appConfig = {
  tikhubBaseUrl: process.env.TIKHUB_BASE_URL || "https://api.tikhub.io",
  tikhubApiKey: process.env.TIKHUB_API_KEY || "",
  openaiBaseUrl: normalizeBaseUrl(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"),
  openaiTextBaseUrl: normalizeBaseUrl(process.env.OPENAI_TEXT_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"),
  openaiImageBaseUrl: normalizeBaseUrl(process.env.OPENAI_IMAGE_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"),
  openaiImageBackupBaseUrl: normalizeOptionalBaseUrl(process.env.OPENAI_IMAGE_BACKUP_BASE_URL || ""),
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiImageApiKey: process.env.OPENAI_IMAGE_API_KEY || process.env.OPENAI_API_KEY || "",
  openaiImageBackupApiKey: process.env.OPENAI_IMAGE_BACKUP_API_KEY || "",
  openaiTextEndpoint: process.env.OPENAI_TEXT_ENDPOINT || "responses",
  openaiTextModel: process.env.OPENAI_TEXT_MODEL || "gpt-5.5",
  openaiImageEndpoint: normalizeImageEndpoint(process.env.OPENAI_IMAGE_ENDPOINT || "responses"),
  openaiImageModel: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
  openaiImageRequestTimeoutMs: numberOrDefault(process.env.OPENAI_IMAGE_REQUEST_TIMEOUT_MS, 180_000),
  feishuCliBin: process.env.FEISHU_CLI_BIN || "",
  feishuCliArgs: process.env.FEISHU_CLI_BITABLE_ARGS || "",
  feishuBitableAppToken: process.env.FEISHU_BITABLE_APP_TOKEN || "",
  feishuBitableTableId: process.env.FEISHU_BITABLE_TABLE_ID || "",
  feishuBitableFieldMap: process.env.FEISHU_BITABLE_FIELD_MAP || "",
  feishuSourceImportEnabled: booleanOrDefault(process.env.FEISHU_SOURCE_IMPORT_ENABLED, true),
  feishuSourceImportBaseToken: process.env.FEISHU_SOURCE_IMPORT_BASE_TOKEN || "JbpPbSIMqaD75wsZ9fAcBy9mnEe",
  feishuSourceImportTableId: process.env.FEISHU_SOURCE_IMPORT_TABLE_ID || "tbllsn3LBZ6mWTyL",
  feishuSourceImportFieldMap: process.env.FEISHU_SOURCE_IMPORT_FIELD_MAP || "",
  feishuNotifyChatId: process.env.FEISHU_NOTIFY_CHAT_ID || "",
  feishuNotifyUserId: process.env.FEISHU_NOTIFY_USER_ID || "",
};

export function getConfigStatus(): ConfigStatus {
  const database = getDatabaseRuntimeStatus();
  return {
    tikhubConfigured: Boolean(appConfig.tikhubApiKey),
    openaiConfigured: Boolean(appConfig.openaiApiKey),
    openaiImageConfigured: Boolean(appConfig.openaiImageApiKey || (appConfig.openaiImageBackupBaseUrl && appConfig.openaiImageBackupApiKey)),
    openaiImageBackupConfigured: Boolean(appConfig.openaiImageBackupBaseUrl && appConfig.openaiImageBackupApiKey),
    feishuConfigured: Boolean(appConfig.feishuCliBin && appConfig.feishuBitableAppToken && appConfig.feishuBitableTableId),
    databaseBackend: database.backend,
    postgresConfigured: database.postgresConfigured,
    textModel: appConfig.openaiTextModel,
    imageModel: appConfig.openaiImageModel,
    imageProvider: appConfig.openaiImageEndpoint,
    openaiImageRequestTimeoutMs: appConfig.openaiImageRequestTimeoutMs,
    openaiBaseUrl: appConfig.openaiBaseUrl,
    openaiTextBaseUrl: appConfig.openaiTextBaseUrl,
    openaiImageBaseUrl: appConfig.openaiImageBaseUrl,
    openaiImageBackupBaseUrl: appConfig.openaiImageBackupBaseUrl || undefined,
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

export type OpenaiImageApiRoute = "primary" | "backup";

export function openaiImageUrl(path: string, route: OpenaiImageApiRoute = "primary") {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return `${openaiImageBaseUrlForRoute(route)}/${cleanPath}`;
}

export function openaiImageApiKey(route: OpenaiImageApiRoute = "primary") {
  return route === "backup" ? appConfig.openaiImageBackupApiKey : appConfig.openaiImageApiKey;
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function normalizeOptionalBaseUrl(value: string) {
  const trimmed = value.trim();
  return trimmed ? normalizeBaseUrl(trimmed) : "";
}

function openaiImageBaseUrlForRoute(route: OpenaiImageApiRoute) {
  if (route === "backup" && appConfig.openaiImageBackupBaseUrl) return appConfig.openaiImageBackupBaseUrl;
  return appConfig.openaiImageBaseUrl;
}

function normalizeImageEndpoint(value: string) {
  const endpoint = value.trim().toLowerCase();
  if (endpoint === "responses" || endpoint === "images") return endpoint;
  return "images";
}

function numberOrDefault(value: string | undefined, fallback: number) {
  const candidate = Number(value);
  return Number.isFinite(candidate) && candidate > 0 ? candidate : fallback;
}

function booleanOrDefault(value: string | undefined, fallback: boolean) {
  if (value === undefined || value.trim() === "") return fallback;
  return /^(1|true|yes|on)$/i.test(value.trim());
}
