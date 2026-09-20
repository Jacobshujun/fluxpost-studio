import { defaultImageStrategyPrompts, defaultImageWashPrompt, resolveImageStrategyPrompts } from "./creation-controls";
import { readAppMetaValue, writeAppMetaValue } from "./database";
import { defaultDistributionCheckPrompt } from "./distribution-check-prompt";
import { defaultImageGenerationSize, normalizeImageGenerationSize } from "./image-size-options";
import { resolveGptImageDimensionSettings } from "./gpt-image-dimensions";
import { normalizeImageModel, normalizeToApisRequestFormat } from "./image-model-options";
import { defaultSimpleRunMediaSettings, type CrawlPlatform, type PlatformCrawlSetting, type PlatformCrawlSettings, type SimpleRunMediaSettings, type WorkspacePromptSettings } from "./types";

const settingsMetaKey = "workspace_prompt_settings_v1";
const simpleDefaultTextInstruction = "保留“热点观点”角度，换成品牌自己的素材和观点，避免复述原文表达。";

export const defaultPlatformCrawlSettings: PlatformCrawlSettings = {
  wechat_channels: { sort: "relevance" },
  xiaohongshu: { sort: "popularity_descending", noteType: 0 },
  douyin: { sort: "0", contentType: "0" },
  weibo: { sort: "hot", searchType: "hot", includeType: "all", timeScope: "" },
};

export const defaultWorkspacePromptSettings: WorkspacePromptSettings = {
  textInstruction: simpleDefaultTextInstruction,
  imageWashPrompt: defaultImageWashPrompt,
  imageStrategyPrompts: defaultImageStrategyPrompts,
  distributionCheckPrompt: defaultDistributionCheckPrompt,
  imageSize: defaultImageGenerationSize,
  imageQuality: "medium",
  imageBackground: "auto",
  imageModel: null,
  imageToApisRequestFormat: null,
  imageOutputFormat: "png",
  imageOutputCompression: 100,
  platformCrawlSettings: defaultPlatformCrawlSettings,
  simpleRunMediaSettings: defaultSimpleRunMediaSettings,
  updatedAt: new Date(0).toISOString(),
};

export async function getWorkspacePromptSettings(): Promise<WorkspacePromptSettings> {
  const stored = await readAppMetaValue(settingsMetaKey);
  if (!stored) {
    return {
      ...defaultWorkspacePromptSettings,
      updatedAt: new Date().toISOString(),
    };
  }

  const parsed = JSON.parse(stored) as Partial<WorkspacePromptSettings>;
  return normalizeWorkspacePromptSettings(parsed);
}

export async function saveWorkspacePromptSettings(input: Partial<WorkspacePromptSettings>) {
  const settings = normalizeWorkspacePromptSettings({
    ...(await getWorkspacePromptSettings()),
    ...input,
    updatedAt: new Date().toISOString(),
  });
  await writeAppMetaValue(settingsMetaKey, JSON.stringify(settings));
  return settings;
}

function normalizeWorkspacePromptSettings(input: Partial<WorkspacePromptSettings>): WorkspacePromptSettings {
  const dimensions = input.imageRatio !== undefined || input.imageResolution !== undefined
    ? resolveGptImageDimensionSettings(input)
    : undefined;
  const imageStrategyPrompts = resolveImageStrategyPrompts({
    ...input.imageStrategyPrompts,
    textImage: input.imageStrategyPrompts?.textImage || input.imageWashPrompt,
  });
  const imageOutputFormat = input.imageOutputFormat === undefined ? "png" : input.imageOutputFormat;
  if (imageOutputFormat !== "png" && imageOutputFormat !== "jpeg") throw new Error("图片格式无效，请选择 PNG 或 JPEG。");
  const imageOutputCompression = input.imageOutputCompression === undefined ? 100 : input.imageOutputCompression;
  if (!Number.isInteger(imageOutputCompression) || imageOutputCompression < 0 || imageOutputCompression > 100) throw new Error("JPEG 压缩必须是 0 到 100 的整数。");
  if (input.imageBackground === "transparent" && imageOutputFormat === "jpeg") throw new Error("透明背景需要 PNG 格式。");
  return {
    imageModel: normalizeImageModel(input.imageModel ?? undefined) ?? null,
    imageToApisRequestFormat: normalizeToApisRequestFormat(input.imageToApisRequestFormat ?? undefined) ?? null,
    imageOutputFormat,
    imageOutputCompression,
    textInstruction: stringOrDefault(input.textInstruction, defaultWorkspacePromptSettings.textInstruction),
    imageWashPrompt: imageStrategyPrompts.textImage,
    imageStrategyPrompts,
    distributionCheckPrompt: stringOrDefault(input.distributionCheckPrompt, defaultWorkspacePromptSettings.distributionCheckPrompt),
    imageSize: normalizeImageGenerationSize(input.imageSize),
    ...dimensions,
    imageQuality: normalizeImageQuality(input.imageQuality),
    imageBackground: normalizeImageBackground(input.imageBackground),
    platformCrawlSettings: normalizePlatformCrawlSettings(input.platformCrawlSettings),
    simpleRunMediaSettings: normalizeSimpleRunMediaSettings(input.simpleRunMediaSettings),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

function stringOrDefault(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeImageQuality(value: unknown): WorkspacePromptSettings["imageQuality"] {
  return value === "low" || value === "medium" || value === "high" || value === "xhigh" || value === "max" ? value : defaultWorkspacePromptSettings.imageQuality;
}

function normalizeImageBackground(value: unknown): WorkspacePromptSettings["imageBackground"] {
  if (value === undefined) return "auto";
  if (value === "auto" || value === "transparent" || value === "opaque") return value;
  throw new Error("图片背景无效，请选择自动、透明或不透明。");
}

function normalizeSimpleRunMediaSettings(input: unknown): SimpleRunMediaSettings {
  const record = isRecord(input) ? input : {};
  return {
    generateImages: booleanOrDefault(record.generateImages, defaultSimpleRunMediaSettings.generateImages),
    useComfyUiKlein: booleanOrDefault(record.useComfyUiKlein, defaultSimpleRunMediaSettings.useComfyUiKlein),
    directOriginalReference: booleanOrDefault(record.directOriginalReference, defaultSimpleRunMediaSettings.directOriginalReference),
    includeSourceVideo: booleanOrDefault(record.includeSourceVideo, defaultSimpleRunMediaSettings.includeSourceVideo),
    enableVideoTranscription: booleanOrDefault(record.enableVideoTranscription, defaultSimpleRunMediaSettings.enableVideoTranscription),
  };
}

function booleanOrDefault(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizePlatformCrawlSettings(input: unknown): PlatformCrawlSettings {
  const record = isRecord(input) ? input : {};
  const platforms: CrawlPlatform[] = ["wechat_channels", "xiaohongshu", "douyin", "weibo"];
  return platforms.reduce<PlatformCrawlSettings>((result, platform) => {
    result[platform] = normalizePlatformCrawlSetting(platform, isRecord(record[platform]) ? record[platform] : {});
    return result;
  }, {});
}

function normalizePlatformCrawlSetting(platform: CrawlPlatform, input: Record<string, unknown>): PlatformCrawlSetting {
  const defaults = defaultPlatformCrawlSettings[platform] || {};
  return {
    mode: normalizeMode(input.mode, defaults.mode),
    sort: stringOrDefault(input.sort, defaults.sort || ""),
    noteType: normalizeNumber(input.noteType, defaults.noteType),
    searchType: stringOrDefault(input.searchType, defaults.searchType || ""),
    includeType: stringOrDefault(input.includeType, defaults.includeType || ""),
    timeScope: normalizeOptionalString(input.timeScope, defaults.timeScope),
    contentType: stringOrDefault(input.contentType, defaults.contentType || ""),
  };
}

function normalizeMode(value: unknown, fallback: PlatformCrawlSetting["mode"]) {
  return value === "keyword" || value === "challenge" ? value : fallback;
}

function normalizeNumber(value: unknown, fallback: number | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeOptionalString(value: unknown, fallback: string | undefined) {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
