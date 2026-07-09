import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ConfigStatus } from "./types";
import { getDatabaseRuntimeStatus } from "./database";
import type { AdvancedConfigPatch, AdvancedConfigPatchValue, AdvancedConfigSnapshot } from "./types";

export const defaultViralImageImitationPrompt =
  "参考图2的场景风格和美学，构图和角度可以变，同时使用图2的汽车漆面质感，为图1的车生成一张汽车美图，保持图1的汽车细节不要变，车牌黑底无字。";

type ConfigDefinition = {
  key: string;
  label: string;
  description: string;
  kind: "text" | "secret" | "number" | "boolean" | "select" | "textarea";
  category: string;
  required?: boolean;
  options?: string[];
  read: () => string | undefined;
  configured?: () => boolean;
};

type ConfigDefinitionGroup = {
  id: string;
  title: string;
  description: string;
  fields: ConfigDefinition[];
};

export let appConfig = readAppConfig();

function readAppConfig() {
  return {
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
  openaiImageEndpoint: normalizeImageEndpoint(process.env.OPENAI_IMAGE_ENDPOINT || "images"),
  openaiImageModel: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
  openaiImageRequestTimeoutMs: numberOrDefault(process.env.OPENAI_IMAGE_REQUEST_TIMEOUT_MS, 180_000),
  viralImageImitationPrompt: stringOrDefault(process.env.VIRAL_IMAGE_IMITATION_PROMPT, defaultViralImageImitationPrompt),
  comfyUiKleinEnabled: booleanOrDefault(process.env.COMFYUI_KLEIN_ENABLED, false),
  comfyUiBaseUrl: normalizeBaseUrl(process.env.COMFYUI_BASE_URL || "http://127.0.0.1:8188"),
  comfyUiKleinWorkflowJson: process.env.COMFYUI_KLEIN_WORKFLOW_API_JSON || process.env.COMFYUI_KLEIN_WORKFLOW_JSON || "",
  comfyUiKleinWorkflowPath: process.env.COMFYUI_KLEIN_WORKFLOW_PATH || "",
  comfyUiKleinClientId: process.env.COMFYUI_KLEIN_CLIENT_ID || "fluxpost-studio",
  comfyUiKleinPromptNodeId: process.env.COMFYUI_KLEIN_PROMPT_NODE_ID || "39",
  comfyUiKleinImageNodeId: process.env.COMFYUI_KLEIN_IMAGE_NODE_ID || "44",
  comfyUiKleinStyleImageNodeId: process.env.COMFYUI_KLEIN_STYLE_IMAGE_NODE_ID || "",
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
  feishuNotifyChatId: process.env.FEISHU_NOTIFY_CHAT_ID || "",
  feishuNotifyUserId: process.env.FEISHU_NOTIFY_USER_ID || "",
  larkTaskChatIds: parseCsv(process.env.LARK_TASK_CHAT_IDS || process.env.FEISHU_TASK_CHAT_IDS || ""),
  larkTaskUserMap: parseKeyValueMap(process.env.LARK_TASK_USER_MAP || process.env.FEISHU_TASK_USER_MAP || ""),
  larkTaskDefaultPlatforms: parseCsv(process.env.LARK_TASK_DEFAULT_PLATFORMS || "douyin,xiaohongshu"),
  larkTaskDefaultCount: numberOrDefault(process.env.LARK_TASK_DEFAULT_COUNT, 3),
  larkTaskConfirmAbove: numberOrDefault(process.env.LARK_TASK_CONFIRM_ABOVE, 20),
  larkTaskApiToken: process.env.LARK_TASK_API_TOKEN || process.env.FEISHU_TASK_API_TOKEN || "",
  arkBaseUrl: normalizeBaseUrl(process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3"),
  arkApiKey: process.env.ARK_API_KEY || process.env.VOLCENGINE_ASR_APP_KEY || process.env.VOLCENGINE_ASR_API_KEY || "",
  arkVideoTranscriptionModel: process.env.ARK_VIDEO_TRANSCRIPTION_MODEL || "doubao-seed-2-0-lite-260428",
  arkVideoTranscriptionPrompt: process.env.ARK_VIDEO_TRANSCRIPTION_PROMPT || "请识别音频中的内容，以文字形式返回识别结果。",
  arkVideoTranscriptionAudioExtractTimeoutMs: numberOrDefault(process.env.ARK_VIDEO_TRANSCRIPTION_AUDIO_EXTRACT_TIMEOUT_MS, 120_000),
  arkVideoTranscriptionUploadTimeoutMs: numberOrDefault(process.env.ARK_VIDEO_TRANSCRIPTION_UPLOAD_TIMEOUT_MS, 300_000),
  arkVideoTranscriptionTimeoutMs: numberOrDefault(process.env.ARK_VIDEO_TRANSCRIPTION_TIMEOUT_MS || process.env.VOLCENGINE_ASR_TIMEOUT_MS, 120_000),
  arkVideoTranscriptionMaxAudioBytes: numberOrDefault(
    process.env.ARK_VIDEO_TRANSCRIPTION_MAX_AUDIO_BYTES || process.env.VOLCENGINE_ASR_MAX_AUDIO_BYTES,
    120 * 1024 * 1024,
  ),
  };
}

export function reloadAppConfig() {
  appConfig = readAppConfig();
  return appConfig;
}

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
    openaiTextEndpoint: appConfig.openaiTextEndpoint,
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
    volcengineAsrConfigured: Boolean(appConfig.arkApiKey),
  };
}

export function getAdvancedConfigSnapshot(): AdvancedConfigSnapshot {
  const groups = advancedConfigGroups.map((group) => ({
    ...group,
    fields: group.fields.map((field) => ({
      key: field.key,
      label: field.label,
      description: field.description,
      kind: field.kind,
      category: field.category,
      required: field.required,
      options: field.options,
      configured: field.configured ? field.configured() : Boolean(process.env[field.key]),
      value: field.kind === "secret" ? undefined : field.read() ?? "",
    })),
  }));
  return {
    groups,
    updatedAt: new Date().toISOString(),
  };
}

export function saveAdvancedConfigPatch(patch: AdvancedConfigPatch) {
  const values = normalizeAdvancedConfigPatch(patch);
  writeEnvironmentFile(values);
  for (const [key, value] of Object.entries(values)) {
    if (value === "") {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  reloadAppConfig();
  return getAdvancedConfigSnapshot();
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

function stringOrDefault(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed || fallback;
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

const advancedConfigGroups: ConfigDefinitionGroup[] = [
  {
    id: "workspace",
    title: "工作区访问",
    description: "小团队白名单、管理员名单和首次管理员初始化密钥。",
    fields: [
      configField("WORKSPACE_AUTH_MODE", "登录模式", "默认 whitelist；accounts 用于账号表模式。", "select", "workspace", {
        options: ["whitelist", "accounts"],
        read: () => process.env.WORKSPACE_AUTH_MODE || "whitelist",
      }),
      configField("WORKSPACE_ALLOWED_USERS", "白名单用户", "逗号分隔；可写成 username:显示名。", "textarea", "workspace"),
      configField("WORKSPACE_ADMIN_USERS", "管理员用户", "逗号分隔，必须是白名单用户的子集。", "textarea", "workspace"),
      configField("WORKSPACE_ACCESS_PASSWORD", "首次管理员密钥", "只用于初始化首个管理员；日常登录使用账号密码。", "secret", "workspace", {
        configured: () => Boolean(process.env.WORKSPACE_ACCESS_PASSWORD),
      }),
    ],
  },
  {
    id: "runtime",
    title: "运行时与队列",
    description: "数据库和本地任务并发限制；留空时使用代码默认值。",
    fields: [
      configField("DATABASE_URL", "PostgreSQL DATABASE_URL", "配置后使用 PostgreSQL；留空则使用本地 SQLite。", "secret", "runtime", {
        configured: () => Boolean(process.env.DATABASE_URL),
      }),
      configField("DATABASE_POOL_MAX", "数据库连接池上限", "PostgreSQL 连接池最大连接数。", "number", "runtime"),
      configField("SIMPLE_RUN_MAX_ITEMS", "简单任务最大条数", "简单模式单次任务允许处理的最大内容数。", "number", "runtime"),
      configField("SIMPLE_RUN_WORKER_CONCURRENCY", "简单任务 worker 并发", "后台简单任务队列并发。", "number", "runtime"),
      configField("FEISHU_PUBLISH_WORKER_CONCURRENCY", "飞书发布队列并发", "飞书记录写入 worker 并发。", "number", "runtime"),
      configField("WORKER_FEISHU_ATTACHMENT_CONCURRENCY", "飞书附件上传并发", "附件上传独立并发上限。", "number", "runtime"),
    ],
  },
  {
    id: "tikhub",
    title: "TikHub 采集",
    description: "关键词采集和来源链接导入使用的 TikHub API。",
    fields: [
      configField("TIKHUB_BASE_URL", "TikHub Base URL", "TikHub API 根地址。", "text", "tikhub", {
        read: () => appConfig.tikhubBaseUrl,
      }),
      configField("TIKHUB_API_KEY", "TikHub API Key", "采集接口密钥。", "secret", "tikhub", {
        required: true,
        configured: () => Boolean(appConfig.tikhubApiKey),
      }),
    ],
  },
  {
    id: "openai-text",
    title: "文本模型",
    description: "正文生成、标签、审核和原创联网搜索使用的 OpenAI 兼容文本接口。",
    fields: [
      configField("OPENAI_BASE_URL", "通用 Base URL", "文本和图片接口的通用回退地址。", "text", "openai-text", {
        read: () => process.env.OPENAI_BASE_URL || appConfig.openaiBaseUrl,
      }),
      configField("OPENAI_TEXT_BASE_URL", "文本 Base URL", "仅文本模型接口使用；留空回退 OPENAI_BASE_URL。", "text", "openai-text", {
        read: () => appConfig.openaiTextBaseUrl,
      }),
      configField("OPENAI_API_KEY", "OpenAI API Key", "文本接口密钥，也可作为图片接口回退密钥。", "secret", "openai-text", {
        required: true,
        configured: () => Boolean(appConfig.openaiApiKey),
      }),
      configField("OPENAI_TEXT_MODEL", "文本模型", "用于内容生成、标签和审核。", "text", "openai-text", {
        read: () => appConfig.openaiTextModel,
      }),
      configField("OPENAI_TEXT_ENDPOINT", "文本接口形态", "responses 支持原创联网搜索；chat 使用 chat completions。", "select", "openai-text", {
        options: ["responses", "chat"],
        read: () => appConfig.openaiTextEndpoint,
      }),
    ],
  },
  {
    id: "openai-image",
    title: "图片模型",
    description: "图片生成、参考图编辑和备用图片通道。",
    fields: [
      configField("OPENAI_IMAGE_BASE_URL", "图片 Base URL", "图片接口主通道；留空回退 OPENAI_BASE_URL。", "text", "openai-image", {
        read: () => appConfig.openaiImageBaseUrl,
      }),
      configField("OPENAI_IMAGE_API_KEY", "图片 API Key", "图片接口主通道密钥；留空回退 OPENAI_API_KEY。", "secret", "openai-image", {
        configured: () => Boolean(process.env.OPENAI_IMAGE_API_KEY),
      }),
      configField("OPENAI_IMAGE_BACKUP_BASE_URL", "备用图片 Base URL", "主通道失败时使用。", "text", "openai-image", {
        read: () => appConfig.openaiImageBackupBaseUrl,
      }),
      configField("OPENAI_IMAGE_BACKUP_API_KEY", "备用图片 API Key", "备用图片通道密钥。", "secret", "openai-image", {
        configured: () => Boolean(appConfig.openaiImageBackupApiKey),
      }),
      configField("OPENAI_IMAGE_MODEL", "图片模型", "默认 gpt-image-2。", "text", "openai-image", {
        read: () => appConfig.openaiImageModel,
      }),
      configField("OPENAI_IMAGE_ENDPOINT", "图片接口形态", "images 为 Images API；responses 为兼容旧通道。", "select", "openai-image", {
        options: ["images", "responses"],
        read: () => appConfig.openaiImageEndpoint,
      }),
      configField("OPENAI_IMAGE_REQUEST_TIMEOUT_MS", "图片请求超时毫秒", "单次图片请求超时。", "number", "openai-image", {
        read: () => String(appConfig.openaiImageRequestTimeoutMs),
      }),
      configField("VIRAL_IMAGE_IMITATION_PROMPT", "爆款仿图系统提示词", "控制爆款图片模仿的全局提示词。", "textarea", "openai-image", {
        read: () => appConfig.viralImageImitationPrompt,
      }),
    ],
  },
  {
    id: "comfyui",
    title: "ComfyUI Klein",
    description: "本地 Klein 工作流图片处理通道，默认关闭。",
    fields: [
      configField("COMFYUI_KLEIN_ENABLED", "启用 Klein", "true 时符合策略的图片任务可走本地 ComfyUI。", "boolean", "comfyui", {
        read: () => String(appConfig.comfyUiKleinEnabled),
      }),
      configField("COMFYUI_BASE_URL", "ComfyUI Base URL", "本地 ComfyUI 服务地址。", "text", "comfyui", {
        read: () => appConfig.comfyUiBaseUrl,
      }),
      configField("COMFYUI_KLEIN_WORKFLOW_PATH", "工作流文件路径", "本地 workflow JSON 文件路径。", "text", "comfyui"),
      configField("COMFYUI_KLEIN_WORKFLOW_API_JSON", "工作流 JSON", "可直接粘贴 API 格式 workflow JSON。", "textarea", "comfyui", {
        configured: () => Boolean(appConfig.comfyUiKleinWorkflowJson.trim()),
      }),
      configField("COMFYUI_KLEIN_FAILURE_POLICY", "失败策略", "fallback_source 失败回退源图；fail 直接失败。", "select", "comfyui", {
        options: ["fallback_source", "fail"],
        read: () => appConfig.comfyUiKleinFailurePolicy,
      }),
    ],
  },
  {
    id: "feishu",
    title: "飞书发布与导入",
    description: "飞书 CLI、Base 发布、内容导入、分发审核和通知。",
    fields: [
      configField("FEISHU_CLI_BIN", "Feishu CLI 路径", "lark-cli / feishu-cli 可执行文件路径或命令名。", "text", "feishu", {
        read: () => appConfig.feishuCliBin,
      }),
      configField("FEISHU_CLI_BITABLE_ARGS", "CLI Bitable 附加参数", "追加给 bitable 写入命令的参数。", "text", "feishu"),
      configField("FEISHU_BITABLE_APP_TOKEN", "发布 Base Token", "生成内容写入目标 Base。", "secret", "feishu", {
        configured: () => Boolean(appConfig.feishuBitableAppToken),
      }),
      configField("FEISHU_BITABLE_TABLE_ID", "发布 Table ID", "生成内容写入目标表。", "secret", "feishu", {
        configured: () => Boolean(appConfig.feishuBitableTableId),
      }),
      configField("FEISHU_BITABLE_FIELD_MAP", "发布字段映射", "JSON 或 key=value 格式字段映射。", "textarea", "feishu"),
      configField("FEISHU_CONTENT_IMPORT_BASE_TOKEN", "任务导入 Base Token", "留空时回退发布 Base。", "secret", "feishu", {
        configured: () => Boolean(process.env.FEISHU_CONTENT_IMPORT_BASE_TOKEN),
      }),
      configField("FEISHU_CONTENT_IMPORT_TABLE_ID", "任务导入 Table ID", "留空时回退发布表。", "secret", "feishu", {
        configured: () => Boolean(process.env.FEISHU_CONTENT_IMPORT_TABLE_ID),
      }),
      configField("FEISHU_CONTENT_IMPORT_FIELD_MAP", "任务导入字段映射", "任务编号、正文、素材和车型字段映射。", "textarea", "feishu"),
      configField("FEISHU_DISTRIBUTION_CHECK_BASE_TOKEN", "分发审核 Base Token", "分发审核读取和写回目标 Base。", "secret", "feishu", {
        configured: () => Boolean(process.env.FEISHU_DISTRIBUTION_CHECK_BASE_TOKEN),
      }),
      configField("FEISHU_DISTRIBUTION_CHECK_TABLE_ID", "分发审核 Table ID", "分发审核目标表。", "secret", "feishu", {
        configured: () => Boolean(process.env.FEISHU_DISTRIBUTION_CHECK_TABLE_ID),
      }),
      configField("FEISHU_DISTRIBUTION_CHECK_VIEW_ID", "分发审核 View ID", "分发审核读取视图。", "secret", "feishu", {
        configured: () => Boolean(process.env.FEISHU_DISTRIBUTION_CHECK_VIEW_ID),
      }),
      configField("FEISHU_DISTRIBUTION_CHECK_FIELD_MAP", "分发审核字段映射", "编号、正文、是否分发、评分等字段映射。", "textarea", "feishu"),
      configField("FEISHU_NOTIFY_CHAT_ID", "通知 Chat ID", "发布成功后通知群聊；与 User ID 二选一。", "secret", "feishu", {
        configured: () => Boolean(appConfig.feishuNotifyChatId),
      }),
      configField("FEISHU_NOTIFY_USER_ID", "通知 User ID", "发布成功后通知个人；与 Chat ID 二选一。", "secret", "feishu", {
        configured: () => Boolean(appConfig.feishuNotifyUserId),
      }),
    ],
  },
  {
    id: "lark-tasks",
    title: "飞书消息任务",
    description: "从飞书/Lark 群消息发起本地生产任务。",
    fields: [
      configField("LARK_TASK_CHAT_IDS", "监听 Chat IDs", "逗号分隔的群聊 ID。", "textarea", "lark-tasks"),
      configField("LARK_TASK_USER_MAP", "发送人账号映射", "open_id=workspace_username，逗号分隔。", "textarea", "lark-tasks"),
      configField("LARK_TASK_API_TOKEN", "任务 API Token", "飞书任务 runner 调用本地 API 的令牌。", "secret", "lark-tasks", {
        configured: () => Boolean(appConfig.larkTaskApiToken),
      }),
      configField("LARK_TASK_DEFAULT_PLATFORMS", "默认平台", "飞书消息任务默认平台列表。", "text", "lark-tasks", {
        read: () => appConfig.larkTaskDefaultPlatforms.join(","),
      }),
      configField("LARK_TASK_DEFAULT_COUNT", "默认条数", "飞书消息任务默认采集条数。", "number", "lark-tasks", {
        read: () => String(appConfig.larkTaskDefaultCount),
      }),
      configField("LARK_TASK_CONFIRM_ABOVE", "确认阈值", "超过该条数时需要确认。", "number", "lark-tasks", {
        read: () => String(appConfig.larkTaskConfirmAbove),
      }),
    ],
  },
  {
    id: "ark",
    title: "视频转写",
    description: "Ark / 火山音频转写，用于视频内容补全文案。",
    fields: [
      configField("ARK_BASE_URL", "Ark Base URL", "Ark API 根地址。", "text", "ark", {
        read: () => appConfig.arkBaseUrl,
      }),
      configField("ARK_API_KEY", "Ark API Key", "视频转写接口密钥。", "secret", "ark", {
        configured: () => Boolean(process.env.ARK_API_KEY),
      }),
      configField("VOLCENGINE_ASR_APP_KEY", "火山 ASR 兼容 Key", "旧环境变量兼容别名。", "secret", "ark", {
        configured: () => Boolean(process.env.VOLCENGINE_ASR_APP_KEY),
      }),
      configField("ARK_VIDEO_TRANSCRIPTION_MODEL", "转写模型", "Ark Responses 音频输入模型。", "text", "ark", {
        read: () => appConfig.arkVideoTranscriptionModel,
      }),
      configField("ARK_VIDEO_TRANSCRIPTION_PROMPT", "转写提示词", "发送给转写模型的提示词。", "textarea", "ark", {
        read: () => appConfig.arkVideoTranscriptionPrompt,
      }),
      configField("ARK_VIDEO_TRANSCRIPTION_MAX_AUDIO_BYTES", "最大音频字节数", "超过该大小的音频不会上传。", "number", "ark", {
        read: () => String(appConfig.arkVideoTranscriptionMaxAudioBytes),
      }),
    ],
  },
];

function configField(
  key: string,
  label: string,
  description: string,
  kind: ConfigDefinition["kind"],
  category: string,
  options: Partial<ConfigDefinition> = {},
): ConfigDefinition {
  return {
    key,
    label,
    description,
    kind,
    category,
    read: () => process.env[key] || "",
    ...options,
  };
}

const advancedConfigByKey = new Map(advancedConfigGroups.flatMap((group) => group.fields.map((field) => [field.key, field])));

function normalizeAdvancedConfigPatch(patch: AdvancedConfigPatch) {
  if (!patch || typeof patch !== "object" || !patch.values || typeof patch.values !== "object") {
    throw new Error("Invalid advanced config payload.");
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(patch.values)) {
    const definition = advancedConfigByKey.get(key);
    if (!definition) throw new Error(`Unsupported config key: ${key}`);
    result[key] = normalizeAdvancedConfigValue(definition, value);
  }
  return result;
}

function normalizeAdvancedConfigValue(definition: ConfigDefinition, value: AdvancedConfigPatchValue) {
  if (value === null) return "";
  if (definition.kind === "boolean") {
    if (typeof value === "boolean") return value ? "true" : "false";
    const text = String(value).trim().toLowerCase();
    if (text === "true" || text === "1" || text === "yes" || text === "on") return "true";
    if (text === "false" || text === "0" || text === "no" || text === "off") return "false";
    throw new Error(`${definition.label} must be true or false.`);
  }

  const text = String(value ?? "").trim();
  if (!text) return "";
  if (definition.kind === "number") {
    const candidate = Number(text);
    if (!Number.isFinite(candidate) || candidate <= 0) throw new Error(`${definition.label} must be a positive number.`);
    return String(candidate);
  }
  if (definition.kind === "select" && definition.options?.length && !definition.options.includes(text)) {
    throw new Error(`${definition.label} has an unsupported value.`);
  }
  return text;
}

function writeEnvironmentFile(values: Record<string, string>) {
  const envPath = path.join(process.cwd(), ".env.local");
  const lines = existsSync(envPath) ? readFileSync(envPath, "utf8").split(/\r?\n/) : [];
  const handled = new Set<string>();
  const nextLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match) {
      nextLines.push(line);
      continue;
    }
    const key = match[1];
    if (!(key in values)) {
      nextLines.push(line);
      continue;
    }
    handled.add(key);
    if (values[key] !== "") nextLines.push(`${key}=${formatEnvValue(values[key])}`);
  }

  for (const [key, value] of Object.entries(values)) {
    if (handled.has(key) || value === "") continue;
    nextLines.push(`${key}=${formatEnvValue(value)}`);
  }

  writeFileSync(envPath, `${trimTrailingBlankLines(nextLines).join("\n")}\n`, "utf8");
}

function formatEnvValue(value: string) {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function trimTrailingBlankLines(lines: string[]) {
  const next = [...lines];
  while (next.length && next[next.length - 1] === "") next.pop();
  return next;
}
