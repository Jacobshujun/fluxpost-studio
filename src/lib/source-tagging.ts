import { compactError, recordExecutionLog } from "./activity-log";
import { appConfig, openaiTextUrl } from "./config";
import { concurrencyConfig, mapWithConcurrency, runWithConcurrencyPool } from "./concurrency";
import { mergeDownloadedAndRemoteImages } from "./media-url-filter";
import { toModelImageUrl } from "./model-image-input";
import { selectBestVideoHighlightFrames } from "./video-frame-policy";
import {
  contentTagOptions,
  visualTagOptions,
  type ContentTag,
  type NormalizedSourceItem,
  type SourceContentTagging,
  type SourceVisualTagging,
  type SourceVisualTaggingAsset,
  type VisualTag,
} from "./types";

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type ResponsesApiTextResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type TaggingJson = {
  contentTags?: unknown;
  tags?: unknown;
  confidence?: unknown;
  reasons?: unknown;
  visualTags?: unknown;
};

type ModelImageInput = {
  id: string;
  imageUrl: string;
};

type PreparedModelImages = {
  inputs: ModelImageInput[];
  assets: Array<Omit<SourceVisualTaggingAsset, "tag">>;
  skipped: Array<{ id: string; error: string }>;
};

const maxContentTags = 4;
const maxVisualAssets = 9;
const beautyCarContentTag: ContentTag = "美女车图";

export const sourceContentTagOptions = contentTagOptions;
export const sourceVisualTagOptions = visualTagOptions;

const visualTagAliases: Record<string, VisualTag> = {
  APP: "APP",
  app: "APP",
  App: "APP",
  应用界面: "APP",
  手机APP: "APP",
  手机App: "APP",
  手机应用界面: "APP",
  车机界面: "APP",
  中控界面: "APP",
  仪表界面: "APP",
};

const contentTagAliases: Record<string, ContentTag> = {
  提车: "提车记录",
  提车作业: "提车记录",
  车主提车: "提车记录",
  新车交付: "提车记录",
  交付记录: "提车记录",
};

export async function tagSourceItems(items: NormalizedSourceItem[]) {
  if (!items.length) return items;
  if (!appConfig.openaiApiKey) {
    const taggedAt = new Date().toISOString();
    return items.map((item) => ({
      ...item,
      contentTagging: {
        tags: [],
        reasons: [],
        status: "skipped",
        error: "OPENAI_API_KEY is not configured",
        taggedAt,
      } satisfies SourceContentTagging,
      visualTagging: buildSkippedVisualTagging(item, taggedAt, "OPENAI_API_KEY is not configured"),
    }));
  }

  return mapWithConcurrency(items, concurrencyConfig.gpt, (item) => tagSourceItem(item));
}

export async function tagSourceItem(item: NormalizedSourceItem): Promise<NormalizedSourceItem> {
  const startedAt = Date.now();
  const visualAssets = collectVisualAssets(item);

  await recordExecutionLog({
    scope: "source/tagging",
    action: "开始内容自动打标",
    status: "running",
    message: `准备分析 ${item.platform} 样本：${item.title || item.sourceId}`,
    details: {
      sourceItemId: item.id,
      visualAssets: visualAssets.length,
      model: appConfig.openaiTextModel,
    },
  });

  const contentTagging = await generateContentTagging(item);
  const visualTagging = await generateVisualTagging(item, visualAssets);
  const hasError = contentTagging.status === "failed" || visualTagging.status === "failed";

  await recordExecutionLog({
    scope: "source/tagging",
    action: hasError ? "内容自动打标部分完成" : "内容自动打标完成",
    status: hasError ? "info" : "success",
    message: `内容标签 ${contentTagging.tags.length} 个，视觉标签 ${visualTagging.assets.length}/${visualAssets.length} 个`,
    durationMs: Date.now() - startedAt,
    details: {
      sourceItemId: item.id,
      contentStatus: contentTagging.status,
      visualStatus: visualTagging.status,
      contentTags: contentTagging.tags.join(","),
      visualTags: visualTagging.assets.length,
    },
  });

  return {
    ...item,
    contentTagging,
    visualTagging,
  };
}

async function generateContentTagging(item: NormalizedSourceItem): Promise<SourceContentTagging> {
  try {
    const json = await callTaggingModel(buildContentTaggingPrompt(item), []);
    return normalizeContentTagging(json, item, new Date().toISOString());
  } catch (error) {
    const message = compactError(error);
    await recordExecutionLog({
      scope: "source/tagging",
      action: "内容标签生成失败",
      status: "error",
      message,
      details: {
        sourceItemId: item.id,
      },
    });
    return {
      tags: [],
      reasons: [],
      status: "failed",
      error: message,
      taggedAt: new Date().toISOString(),
      model: appConfig.openaiTextModel,
    };
  }
}

async function generateVisualTagging(
  item: NormalizedSourceItem,
  visualAssets: Array<Omit<SourceVisualTaggingAsset, "tag">>,
): Promise<SourceVisualTagging> {
  if (!visualAssets.length) {
    return {
      assets: [],
      status: "skipped",
      error: "No visual assets",
      taggedAt: new Date().toISOString(),
      model: appConfig.openaiTextModel,
    };
  }

  try {
    const prepared = await prepareModelImages(visualAssets);
    if (prepared.skipped.length) {
      await recordExecutionLog({
        scope: "source/tagging",
        action: "视觉素材预处理跳过",
        status: "info",
        message: `已跳过 ${prepared.skipped.length} 个无法发送给模型的视觉素材`,
        details: {
          sourceItemId: item.id,
          skippedAssets: prepared.skipped.length,
          errorSummary: prepared.skipped.slice(0, 5).map((asset) => `${asset.id}: ${asset.error}`).join("; "),
        },
      });
    }
    if (!prepared.inputs.length) {
      throw new Error("No model-readable visual assets were available");
    }
    const json = await callTaggingModel(buildVisualTaggingPrompt(item, prepared.assets), prepared.inputs);
    return normalizeVisualTagging(json, prepared.assets, new Date().toISOString());
  } catch (error) {
    const message = compactError(error);
    await recordExecutionLog({
      scope: "source/tagging",
      action: "视觉标签生成失败",
      status: "error",
      message,
      details: {
        sourceItemId: item.id,
        visualAssets: visualAssets.length,
      },
    });
    return {
      assets: [],
      status: "failed",
      error: message,
      taggedAt: new Date().toISOString(),
      model: appConfig.openaiTextModel,
    };
  }
}

export function updateSourceContentTags(
  current: SourceContentTagging | undefined,
  tags: unknown,
): SourceContentTagging {
  const now = new Date().toISOString();
  return {
    tags: normalizeContentTags(tags),
    confidence: current?.confidence,
    reasons: current?.reasons || [],
    model: current?.model,
    taggedAt: current?.taggedAt,
    status: "success",
    error: undefined,
    updatedBy: "user",
    updatedAt: now,
  };
}

export function updateSourceVisualTags(
  item: NormalizedSourceItem,
  patchAssets: unknown,
): SourceVisualTagging {
  const now = new Date().toISOString();
  const currentById = new Map((item.visualTagging?.assets || []).map((asset) => [asset.id, asset]));
  const baseAssets = collectVisualAssets(item);
  const patchMap = new Map<string, VisualTag>();

  if (Array.isArray(patchAssets)) {
    patchAssets.forEach((asset) => {
      if (!asset || typeof asset !== "object") return;
      const id = "id" in asset && typeof asset.id === "string" ? asset.id : "";
      const tag = "tag" in asset ? normalizeVisualTag((asset as { tag?: unknown }).tag) : undefined;
      if (id && tag) patchMap.set(id, tag);
    });
  }

  const assets = baseAssets.reduce<SourceVisualTaggingAsset[]>((result, asset) => {
    const current = currentById.get(asset.id);
    const tag = patchMap.get(asset.id) || current?.tag;
    if (!tag) return result;
    result.push({
        ...asset,
        tag,
        confidence: current?.confidence,
        reason: current?.reason,
        model: current?.model,
        taggedAt: current?.taggedAt,
        updatedBy: patchMap.has(asset.id) ? ("user" as const) : current?.updatedBy,
        updatedAt: patchMap.has(asset.id) ? now : current?.updatedAt,
    });
    return result;
  }, []);

  return {
    assets,
    model: item.visualTagging?.model,
    taggedAt: item.visualTagging?.taggedAt,
    status: assets.length ? "success" : "skipped",
    error: undefined,
  };
}

export function collectVisualAssets(item: NormalizedSourceItem): Array<Omit<SourceVisualTaggingAsset, "tag">> {
  const frameAssets = selectBestVideoHighlightFrames(item.videoFrames).map((frame, index) => ({
    id: `frame-${index + 1}`,
    index,
    kind: "video_frame" as const,
    url: frame.url,
    localPath: isAppLocalMediaUrl(frame.url) ? frame.url : undefined,
  }));

  if (shouldUseVideoFramesForVisualTagging(item) && frameAssets.length) {
    return frameAssets.slice(0, maxVisualAssets);
  }

  const imageUrls = mergeDownloadedAndRemoteImages(item.downloadedImages, item.images, { preferDownloaded: true });
  const imageAssets = imageUrls.map((url, index) => ({
    id: `image-${index + 1}`,
    index,
    kind: "image" as const,
    url,
    localPath: isAppLocalMediaUrl(url) ? url : undefined,
  }));

  return imageAssets.slice(0, maxVisualAssets);
}

function shouldUseVideoFramesForVisualTagging(item: NormalizedSourceItem) {
  return Boolean(
    item.videoFrames?.length &&
      (item.mediaType === "video" || item.mediaType === "mixed" || item.videoUrl || item.downloadedVideoUrl),
  );
}

export function normalizeContentTags(value: unknown): ContentTag[] {
  const candidates = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,，、\s]+/) : [];
  const allowed = new Set<string>(contentTagOptions);
  return Array.from(
    new Set(
      candidates
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .map((item) => contentTagAliases[item] || item)
        .filter((item): item is ContentTag => allowed.has(item)),
    ),
  ).slice(0, maxContentTags);
}

export function normalizeVisualTag(value: unknown): VisualTag | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  const alias = visualTagAliases[normalized] || visualTagAliases[normalized.toUpperCase()];
  if (alias) return alias;
  return (visualTagOptions as readonly string[]).includes(normalized) ? (normalized as VisualTag) : undefined;
}

function normalizeContentTagging(json: TaggingJson, item: NormalizedSourceItem, taggedAt: string): SourceContentTagging {
  return {
    tags: normalizeAiContentTags(json.contentTags ?? json.tags, item),
    confidence: normalizeConfidence(json.confidence),
    reasons: arrayOfStrings(json.reasons).slice(0, 4),
    model: appConfig.openaiTextModel,
    taggedAt,
    status: "success",
    updatedBy: "ai",
    updatedAt: taggedAt,
  };
}

function normalizeAiContentTags(value: unknown, item: NormalizedSourceItem): ContentTag[] {
  return normalizeContentTags(value).filter((tag) => tag !== beautyCarContentTag || hasBeautyCarTextEvidence(item));
}

function hasBeautyCarTextEvidence(item: NormalizedSourceItem) {
  const text = [item.title, item.contentText].filter(Boolean).join("\n");
  if (!text.trim()) return false;
  const noPeoplePattern = /(纯车|纯外观|没有人物|没有人出镜|无人出镜|无人物|无真人|不含人物|无美女|没有美女|没有小姐姐|没有女生)/;
  if (noPeoplePattern.test(text)) return false;

  const strongPeopleCarPattern = /(车模|美女车图|美女车照|美女车拍|小姐姐.{0,12}(车|拍|图|写真|出镜)|女车主.{0,12}(出镜|拍照|写真|合影|同框)|女生.{0,12}(和车|与车|拍照|写真|出镜|同框)|女性.{0,12}(出镜|拍照|写真|同框)|女模.{0,12}(车|拍|写真)|人车写真|人车大片|人车合影|人车同框)/;
  if (strongPeopleCarPattern.test(text)) return true;

  const femalePattern = /(美女|小姐姐|女生|女车主|女神|妹子|姑娘|女孩|女性|辣妹|女模)/;
  const visualContextPattern = /(拍照|写真|出镜|同框|合影|摆拍|街拍|大片|美图|车图|图集|壁纸|赏图|上镜|模特)/;
  return femalePattern.test(text) && visualContextPattern.test(text);
}

function normalizeVisualTagging(
  json: TaggingJson,
  visualAssets: Array<Omit<SourceVisualTaggingAsset, "tag">>,
  taggedAt: string,
): SourceVisualTagging {
  if (!visualAssets.length) {
    return {
      assets: [],
      model: appConfig.openaiTextModel,
      taggedAt,
      status: "skipped",
      error: "No visual assets",
    };
  }

  const rawAssets = Array.isArray(json.visualTags) ? json.visualTags : [];
  const byId = new Map<string, Record<string, unknown>>();
  rawAssets.forEach((asset, index) => {
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) return;
    const record = asset as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : `image-${index + 1}`;
    byId.set(id, record);
  });

  const assets = visualAssets.reduce<SourceVisualTaggingAsset[]>((result, asset) => {
    const raw = byId.get(asset.id);
    const tag = normalizeVisualTag(raw?.tag);
    if (!tag) return result;
    result.push({
        ...asset,
        tag,
        confidence: normalizeConfidence(raw?.confidence),
        reason: typeof raw?.reason === "string" ? raw.reason.slice(0, 160) : undefined,
        model: appConfig.openaiTextModel,
        taggedAt,
        updatedBy: "ai",
        updatedAt: taggedAt,
    });
    return result;
  }, []);

  return {
    assets,
    model: appConfig.openaiTextModel,
    taggedAt,
    status: assets.length ? "success" : "failed",
    error: assets.length ? undefined : "Model returned no valid visual tags",
  };
}

function buildSkippedVisualTagging(item: NormalizedSourceItem, taggedAt: string, error: string): SourceVisualTagging {
  const assets = collectVisualAssets(item);
  return {
    assets: [],
    status: assets.length ? "skipped" : "skipped",
    error: assets.length ? error : "No visual assets",
    taggedAt,
  };
}

function buildContentTaggingPrompt(item: NormalizedSourceItem) {
  return [
    "你是汽车社媒内容运营专家。请给采集到的内容打标签，必须只输出合法 JSON。",
    "内容标签只能从以下列表选择，可以多选，但最多 4 个。模糊时少选，不要为了凑数硬选。",
    contentTagOptions.join("、"),
    "提车记录：车主提车、交付现场、提车作业、提车当天体验或晒新车钥匙/交付花束等内容。该标签用于归档，不进入后续内容生产。",
    "美女车图：仅当标题或正文明确出现美女、小姐姐、女生、女车主、车模、女性出镜等语义时选择；纯车外观、车型美图、汽车美图、车图合集、没有人物或无法确认人物时不要选择。",
    "输出 JSON 结构：",
    '{"contentTags":["新车曝光"],"confidence":0.85,"reasons":["理由"]}',
    `平台: ${item.platform}`,
    `内容形式: ${item.mediaType || "unknown"}`,
    `标题: ${item.title || ""}`,
    `正文: ${item.contentText || ""}`,
    `作者: ${item.authorName || ""}`,
    `指标: ${JSON.stringify(item.metrics || {})}`,
  ].join("\n");
}

function buildVisualTaggingPrompt(item: NormalizedSourceItem, visualAssets: Array<Omit<SourceVisualTaggingAsset, "tag">>) {
  const mediaLines = visualAssets.map((asset, index) => `${asset.id}: 第 ${index + 1} 张，${asset.kind === "video_frame" ? "视频高光帧" : "图片"}`);
  return [
    "你是汽车社媒视觉素材标注助手。请查看随消息提供的图片，给每一张图打 1 个视觉标签，只输出合法 JSON。",
    "标签只能从以下列表选择：",
    visualTagOptions.join("、"),
    "标签判定优先级：APP > 带文字图 > 人车美图 > 车型美图 > 汽车外观 > 内饰空间。",
    "APP：手机 App 截图、车机/中控/仪表界面、导航、能耗、充电、辅助驾驶、OTA 等屏幕 UI，界面控件和文字密集。",
    "带文字图：海报、信息图、文字内容图，但不是 App 或车机界面。只要图片存在显著标题、卖点、参数、说明文字、脚注或品牌海报文案，即使整车或车型主体占画面核心，也优先选择带文字图。",
    "人车美图：车外观和人物同时明显，人物参与构图、摆拍或场景氛围。",
    "车型美图：纯车外观美图，没有人物，整车或车型主体占画面核心，且没有显著标题或说明文字。",
    "汽车外观：车身外观、外观局部、车灯、轮毂、充电口、路边随拍等，不满足带文字图、车型美图或人车美图时使用。",
    "内饰空间：座舱、座椅、中控台等车内空间，不以屏幕 UI 为主体。",
    "输出 JSON 结构：",
    '{"visualTags":[{"id":"image-1","tag":"汽车外观","confidence":0.8,"reason":"车身外观占主体"}]}',
    "必须按 id 返回，不能新增 id。看不清时选择最保守的标签，并在 reason 中说明。",
    `标题: ${item.title || ""}`,
    `正文摘要: ${(item.contentText || "").slice(0, 500)}`,
    `视觉素材:\n${mediaLines.join("\n")}`,
  ].join("\n");
}

async function callTaggingModel(prompt: string, images: ModelImageInput[]): Promise<TaggingJson> {
  const text =
    appConfig.openaiTextEndpoint === "chat"
      ? await callChatCompletions(prompt, images)
      : await callResponsesApi(prompt, images);
  return parseJsonObject(text) as TaggingJson;
}

async function callResponsesApi(prompt: string, images: ModelImageInput[]) {
  const content = images.length
    ? [
        { type: "input_text", text: prompt },
        ...images.map((image) => ({
          type: "input_image",
          image_url: image.imageUrl,
        })),
      ]
    : undefined;
  const response = await runWithConcurrencyPool("gpt", () =>
    fetch(openaiTextUrl("responses"), {
      method: "POST",
      headers: openaiHeaders(),
      body: JSON.stringify({
        model: appConfig.openaiTextModel,
        input: images.length
          ? [
              {
                role: "user",
                content,
              },
            ]
          : prompt,
        text: {
          format: {
            type: "json_object",
          },
        },
      }),
    }),
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI tagging request failed: ${response.status} ${body.slice(0, 260)}`);
  }

  const data = (await response.json()) as ResponsesApiTextResponse;
  return (
    data.output_text ||
    data.output?.flatMap((item) => item.content || []).find((content) => typeof content.text === "string")?.text ||
    "{}"
  );
}

async function callChatCompletions(prompt: string, images: ModelImageInput[]) {
  const content = images.length
    ? [
        { type: "text", text: prompt },
        ...images.map((image) => ({
          type: "image_url",
          image_url: {
            url: image.imageUrl,
          },
        })),
      ]
    : prompt;
  const response = await runWithConcurrencyPool("gpt", () =>
    fetch(openaiTextUrl("chat/completions"), {
      method: "POST",
      headers: openaiHeaders(),
      body: JSON.stringify({
        model: appConfig.openaiTextModel,
        messages: [
        {
          role: "system",
          content: "你只输出合法 JSON，不要输出 Markdown。",
        },
        {
          role: "user",
          content,
        },
        ],
        response_format: {
          type: "json_object",
        },
      }),
    }),
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI chat tagging request failed: ${response.status} ${body.slice(0, 260)}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  return data.choices?.[0]?.message?.content || "{}";
}

function openaiHeaders() {
  return {
    Authorization: `Bearer ${appConfig.openaiApiKey}`,
    "Content-Type": "application/json",
  };
}

function parseJsonObject(text: string): Record<string, unknown> {
  const normalized = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(normalized) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
}

function normalizeConfidence(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(Math.max(parsed, 0), 1);
}

function isAppLocalMediaUrl(url: string) {
  return url.startsWith("/media/") || url.startsWith("/generated/");
}

async function prepareModelImages(assets: Array<Omit<SourceVisualTaggingAsset, "tag">>): Promise<PreparedModelImages> {
  const inputs: ModelImageInput[] = [];
  const modelAssets: Array<Omit<SourceVisualTaggingAsset, "tag">> = [];
  const skipped: PreparedModelImages["skipped"] = [];
  for (const asset of assets) {
    try {
      const imageUrl = await toModelImageUrl(asset.url);
      if (!imageUrl) {
        skipped.push({ id: asset.id, error: "unsupported visual asset URL" });
        continue;
      }
      inputs.push({ id: asset.id, imageUrl });
      modelAssets.push(asset);
    } catch (error) {
      skipped.push({ id: asset.id, error: compactError(error) });
    }
  }
  return { inputs, assets: modelAssets, skipped };
}
