import { defaultImageStrategyPrompts, defaultImageWashPrompt, resolveImageStrategyPrompts } from "./creation-controls";
import { readAppMetaValue, writeAppMetaValue } from "./database";
import { defaultDistributionCheckPrompt } from "./distribution-check-prompt";
import { defaultImageGenerationSize, normalizeImageGenerationSize } from "./image-size-options";
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
  const imageStrategyPrompts = resolveImageStrategyPrompts({
    ...input.imageStrategyPrompts,
    textImage: input.imageStrategyPrompts?.textImage || input.imageWashPrompt,
  });
  return {
    textInstruction: stringOrDefault(input.textInstruction, defaultWorkspacePromptSettings.textInstruction),
    imageWashPrompt: imageStrategyPrompts.textImage,
    imageStrategyPrompts,
    distributionCheckPrompt: stringOrDefault(input.distributionCheckPrompt, defaultWorkspacePromptSettings.distributionCheckPrompt),
    imageSize: normalizeImageGenerationSize(input.imageSize),
    imageQuality: normalizeImageQuality(input.imageQuality),
    platformCrawlSettings: normalizePlatformCrawlSettings(input.platformCrawlSettings),
    simpleRunMediaSettings: normalizeSimpleRunMediaSettings(input.simpleRunMediaSettings),
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

function stringOrDefault(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeImageQuality(value: unknown): WorkspacePromptSettings["imageQuality"] {
  return value === "low" || value === "medium" || value === "high" ? value : defaultWorkspacePromptSettings.imageQuality;
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
