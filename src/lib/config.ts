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
  comfyUiKleinEnabled: booleanOrDefault(process.env.COMFYUI_KLEIN_ENABLED, false),
  comfyUiBaseUrl: normalizeBaseUrl(process.env.COMFYUI_BASE_URL || "http://127.0.0.1:8188"),
  comfyUiKleinWorkflowJson: process.env.COMFYUI_KLEIN_WORKFLOW_API_JSON || process.env.COMFYUI_KLEIN_WORKFLOW_JSON || "",
  comfyUiKleinWorkflowPath: process.env.COMFYUI_KLEIN_WORKFLOW_PATH || "",
  comfyUiKleinClientId: process.env.COMFYUI_KLEIN_CLIENT_ID || "fluxpost-studio",
  comfyUiKleinPromptNodeId: process.env.COMFYUI_KLEIN_PROMPT_NODE_ID || "39",
  comfyUiKleinImageNodeId: process.env.COMFYUI_KLEIN_IMAGE_NODE_ID || "44",
  comfyUiKleinKSamplerNodeId: process.env.COMFYUI_KLEIN_KSAMPLER_NODE_ID || "28",
  comfyUiKleinSaveNodeId: process.env.COMFYUI_KLEIN_SAVE_NODE_ID || "43",
  comfyUiKleinUploadSubfolder: process.env.COMFYUI_KLEIN_UPLOAD_SUBFOLDER || "fluxpost",
  comfyUiKleinTimeoutMs: numberOrDefault(process.env.COMFYUI_KLEIN_TIMEOUT_MS, 240_000),
  comfyUiKleinPollIntervalMs: numberOrDefault(process.env.COMFYUI_KLEIN_POLL_INTERVAL_MS, 1_000),
  comfyUiKleinRandomizeSeed: booleanOrDefault(process.env.COMFYUI_KLEIN_RANDOMIZE_SEED, true),
  comfyUiKleinSeed: optionalNumber(process.env.COMFYUI_KLEIN_SEED),
  comfyUiKleinSteps: optionalNumber(process.env.COMFYUI_KLEIN_KSAMPLER_STEPS),
  comfyUiKleinCfg: optionalNumber(process.env.COMFYUI_KLEIN_KSAMPLER_CFG),
  comfyUiKleinSamplerName: process.env.COMFYUI_KLEIN_KSAMPLER_SAMPLER_NAME || "",
  comfyUiKleinScheduler: process.env.COMFYUI_KLEIN_KSAMPLER_SCHEDULER || "",
  comfyUiKleinDenoise: optionalNumber(process.env.COMFYUI_KLEIN_KSAMPLER_DENOISE),
  comfyUiKleinFailurePolicy: normalizeKleinFailurePolicy(process.env.COMFYUI_KLEIN_FAILURE_POLICY || "fallback_source"),
  feishuCliBin: process.env.FEISHU_CLI_BIN || "",
  feishuCliArgs: process.env.FEISHU_CLI_BITABLE_ARGS || "",
  feishuBitableAppToken: process.env.FEISHU_BITABLE_APP_TOKEN || "",
  feishuBitableTableId: process.env.FEISHU_BITABLE_TABLE_ID || "",
  feishuBitableFieldMap: process.env.FEISHU_BITABLE_FIELD_MAP || "",
  feishuContentImportBaseToken: process.env.FEISHU_CONTENT_IMPORT_BASE_TOKEN || process.env.FEISHU_BITABLE_APP_TOKEN || "",
  feishuContentImportTableId: process.env.FEISHU_CONTENT_IMPORT_TABLE_ID || process.env.FEISHU_BITABLE_TABLE_ID || "",
  feishuContentImportFieldMap: process.env.FEISHU_CONTENT_IMPORT_FIELD_MAP || "",
  feishuDistributionCheckBaseToken: process.env.FEISHU_DISTRIBUTION_CHECK_BASE_TOKEN || "JbpPbSIMqaD75wsZ9fAcBy9mnEe",
  feishuDistributionCheckTableId: process.env.FEISHU_DISTRIBUTION_CHECK_TABLE_ID || "tblA0EfoAF9J4ffi",
  feishuDistributionCheckViewId: process.env.FEISHU_DISTRIBUTION_CHECK_VIEW_ID || "vewE44G31p",
  feishuDistributionCheckFieldMap: process.env.FEISHU_DISTRIBUTION_CHECK_FIELD_MAP || "",
  feishuSourceImportEnabled: booleanOrDefault(process.env.FEISHU_SOURCE_IMPORT_ENABLED, true),
  feishuSourceImportBaseToken: process.env.FEISHU_SOURCE_IMPORT_BASE_TOKEN || "JbpPbSIMqaD75wsZ9fAcBy9mnEe",
  feishuSourceImportTableId: process.env.FEISHU_SOURCE_IMPORT_TABLE_ID || "tbllsn3LBZ6mWTyL",
  feishuSourceImportFieldMap: process.env.FEISHU_SOURCE_IMPORT_FIELD_MAP || "",
  feishuNotifyChatId: process.env.FEISHU_NOTIFY_CHAT_ID || "",
  feishuNotifyUserId: process.env.FEISHU_NOTIFY_USER_ID || "",
  larkTaskChatIds: parseCsv(process.env.LARK_TASK_CHAT_IDS || process.env.FEISHU_TASK_CHAT_IDS || ""),
  larkTaskUserMap: parseKeyValueMap(process.env.LARK_TASK_USER_MAP || process.env.FEISHU_TASK_USER_MAP || ""),
  larkTaskDefaultPlatforms: parseCsv(process.env.LARK_TASK_DEFAULT_PLATFORMS || "douyin,xiaohongshu"),
  larkTaskDefaultCount: numberOrDefault(process.env.LARK_TASK_DEFAULT_COUNT, 3),
  larkTaskConfirmAbove: numberOrDefault(process.env.LARK_TASK_CONFIRM_ABOVE, 20),
  larkTaskApiToken: process.env.LARK_TASK_API_TOKEN || process.env.FEISHU_TASK_API_TOKEN || "",
};

export function getConfigStatus(): ConfigStatus {
  const database = getDatabaseRuntimeStatus();
  const comfyUiKleinWorkflowConfigured = Boolean(appConfig.comfyUiKleinWorkflowJson.trim() || appConfig.comfyUiKleinWorkflowPath);
  return {
    tikhubConfigured: Boolean(appConfig.tikhubApiKey),
    openaiConfigured: Boolean(appConfig.openaiApiKey),
    openaiImageConfigured: Boolean(appConfig.openaiImageApiKey || (appConfig.openaiImageBackupBaseUrl && appConfig.openaiImageBackupApiKey)),
    openaiImageBackupConfigured: Boolean(appConfig.openaiImageBackupBaseUrl && appConfig.openaiImageBackupApiKey),
    feishuConfigured: Boolean(appConfig.feishuCliBin && appConfig.feishuBitableAppToken && appConfig.feishuBitableTableId),
    feishuContentImportConfigured: Boolean(
      appConfig.feishuCliBin && appConfig.feishuContentImportBaseToken && appConfig.feishuContentImportTableId,
    ),
    feishuDistributionCheckConfigured: Boolean(
      appConfig.feishuCliBin && appConfig.feishuDistributionCheckBaseToken && appConfig.feishuDistributionCheckTableId,
    ),
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
    comfyUiKleinEnabled: appConfig.comfyUiKleinEnabled,
    comfyUiKleinConfigured: Boolean(appConfig.comfyUiKleinEnabled && comfyUiKleinWorkflowConfigured),
    comfyUiKleinWorkflowConfigured,
    comfyUiKleinWorkflowJsonConfigured: Boolean(appConfig.comfyUiKleinWorkflowJson.trim()),
    comfyUiBaseUrl: appConfig.comfyUiBaseUrl,
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

function normalizeKleinFailurePolicy(value: string) {
  const policy = value.trim().toLowerCase();
  if (policy === "fail") return "fail";
  return "fallback_source";
}

function numberOrDefault(value: string | undefined, fallback: number) {
  const candidate = Number(value);
  return Number.isFinite(candidate) && candidate > 0 ? candidate : fallback;
}

function optionalNumber(value: string | undefined) {
  if (value === undefined || value.trim() === "") return undefined;
  const candidate = Number(value);
  return Number.isFinite(candidate) ? candidate : undefined;
}

function booleanOrDefault(value: string | undefined, fallback: boolean) {
  if (value === undefined || value.trim() === "") return fallback;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

function parseCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseKeyValueMap(value: string) {
  const result: Record<string, string> = {};
  for (const entry of parseCsv(value)) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = entry.slice(0, separatorIndex).trim();
    const mappedValue = entry.slice(separatorIndex + 1).trim();
    if (key && mappedValue) result[key] = mappedValue;
  }
  return result;
}
