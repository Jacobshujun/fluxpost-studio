import path from "node:path";
import { stat } from "node:fs/promises";
import { compactError, recordExecutionLog } from "./activity-log";
import { appConfig, openaiTextUrl } from "./config";
import { runWithConcurrencyPool } from "./concurrency";
import { defaultImageStrategyPrompts } from "./creation-controls";
import { generatePost } from "./openai";
import { toModelImageUrl } from "./model-image-input";
import { buildProductionPlan } from "./production-plan";
import { resolveSourceLinks } from "./source-link-import";
import type {
  GeneratedPost,
  MaterialVisualProfile,
  NormalizedSourceItem,
  SourceImageTask,
  ViralImageSpec,
  ViralStyleAnalysis,
  WorkspacePromptSettings,
} from "./types";

export type ViralSourceAnalysis = {
  item: NormalizedSourceItem;
  style: ViralStyleAnalysis;
  images: string[];
};

export type IndexedMaterialImage = {
  path: string;
  name: string;
  referenceMaterialPath: string;
  profile: MaterialVisualProfile;
};

export type ViralImageMaterialMatch = {
  spec: ViralImageSpec;
  material?: IndexedMaterialImage;
  score: number;
  reason: string;
};

export type ViralImageReferencePair = {
  index: number;
  sourceImageUrl: string;
  sourceSpec?: ViralImageSpec;
  material: IndexedMaterialImage;
};

export type ViralImageAnalysisResult = {
  specs: ViralImageSpec[];
  failures: Array<{ index: number; sourceUrl: string; error: string }>;
};

type ModelImageInput = {
  id: string;
  imageUrl: string;
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

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const maxViralImages = 9;
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const viralImageTypes = ["photo", "info_card", "poster", "comparison", "screenshot", "unknown"] as const;
const viralShotSizes = ["wide", "medium", "close", "detail", "unknown"] as const;
const viralVehicleParts = ["full_vehicle", "front", "side", "rear", "interior", "wheel", "light", "screen", "detail", "unknown"] as const;
const viralAngles = ["front", "front_three_quarter", "side", "rear", "rear_three_quarter", "top", "interior", "unknown"] as const;
const viralStrategies = ["car_reference", "people_with_car", "text_image", "keep_layout"] as const;

export async function analyzeViralSource(url: string, targetKeyword: string): Promise<ViralSourceAnalysis> {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) throw new Error("Viral source URL is required");
  const resolved = await resolveSourceLinks({ links: [trimmedUrl] });
  const item = resolved.items[0];
  if (!item) {
    const result = resolved.results[0];
    throw new Error(result?.error || "Viral source link could not be resolved");
  }
  const images = [...(item.downloadedImages || []), ...item.images].filter(Boolean).slice(0, maxViralImages);
  return {
    item,
    images,
    style: buildStyleAnalysis(item, images.length, targetKeyword),
  };
}

export async function analyzeViralImages(images: string[]): Promise<ViralImageAnalysisResult> {
  const specs: ViralImageSpec[] = [];
  const failures: ViralImageAnalysisResult["failures"] = [];
  const limitedImages = images.slice(0, maxViralImages);

  await Promise.all(
    limitedImages.map(async (sourceUrl, index) => {
      try {
        const imageUrl = await toModelImageUrl(sourceUrl);
        if (!imageUrl) throw new Error("unsupported viral image URL");
        const spec = await analyzeSingleViralImage(sourceUrl, index, {
          id: `viral-source-image-${index + 1}`,
          imageUrl,
        });
        specs.push(spec);
      } catch (error) {
        failures.push({
          index,
          sourceUrl,
          error: compactError(error),
        });
      }
    }),
  );

  specs.sort((a, b) => a.index - b.index);
  failures.sort((a, b) => a.index - b.index);

  await recordExecutionLog({
    scope: "viral/replication",
    action: "Analyze viral source image styles",
    status: failures.length ? "info" : "success",
    message: `Analyzed ${specs.length}/${limitedImages.length} viral image style prompt(s).`,
    details: {
      imageCount: limitedImages.length,
      analyzedImageCount: specs.length,
      skippedImageCount: failures.length,
    },
  });

  return { specs, failures };
}

export async function indexMaterialImages(materialPaths: string[], targetKeyword: string): Promise<IndexedMaterialImage[]> {
  const indexed: IndexedMaterialImage[] = [];
  for (const materialPath of Array.from(new Set(materialPaths.map((item) => item.trim()).filter(Boolean)))) {
    const extension = path.extname(materialPath).toLowerCase();
    if (!imageExtensions.has(extension)) continue;
    try {
      const fileStat = await stat(materialPath);
      if (!fileStat.isFile()) continue;
    } catch {
      continue;
    }
    indexed.push({
      path: materialPath,
      name: path.basename(materialPath),
      referenceMaterialPath: materialPath,
      profile: inferMaterialProfile(materialPath, targetKeyword),
    });
  }
  return indexed;
}

export function matchViralImagesToMaterials(
  imageSpecs: ViralImageSpec[],
  materialProfiles: IndexedMaterialImage[],
  targetKeyword: string,
): ViralImageMaterialMatch[] {
  const usedMaterialPaths = new Set<string>();
  return imageSpecs.map((spec) => {
    const ranked = materialProfiles
      .filter((material) => !usedMaterialPaths.has(material.path))
      .map((material) => ({ material, score: scoreMaterialMatch(spec, material.profile, targetKeyword) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best || best.score < 20) {
      return { spec, score: best?.score || 0, reason: "No matching local material image" };
    }
    usedMaterialPaths.add(best.material.path);
    return {
      spec,
      material: best.material,
      score: best.score,
      reason: `Matched ${best.material.name} with score ${best.score}`,
    };
  });
}

export async function pairViralImagesWithMaterials(
  sourceImages: string[],
  materialPaths: string[],
  targetKeyword: string,
  sourceSpecs: ViralImageSpec[] = [],
): Promise<{
  pairs: ViralImageReferencePair[];
  sourceImageCount: number;
  vehicleImageCount: number;
}> {
  const limitedSourceImages = sourceImages.filter(Boolean).slice(0, maxViralImages);
  const sourceSpecByIndex = new Map(sourceSpecs.map((spec) => [spec.index, spec]));
  const materialProfiles = (await indexMaterialImages(materialPaths, targetKeyword)).slice(0, maxViralImages);
  const pairCount = Math.min(limitedSourceImages.length, materialProfiles.length, maxViralImages);
  return {
    pairs: Array.from({ length: pairCount }, (_, index) => ({
      index,
      sourceImageUrl: limitedSourceImages[index],
      sourceSpec: sourceSpecByIndex.get(index),
      material: materialProfiles[index],
    })),
    sourceImageCount: limitedSourceImages.length,
    vehicleImageCount: materialProfiles.length,
  };
}

export async function buildViralGeneratedPost(input: {
  source: ViralSourceAnalysis;
  targetKeyword: string;
  materialPaths: string[];
  imagePairs: ViralImageReferencePair[];
  settings: WorkspacePromptSettings;
  imitateImages?: boolean;
}): Promise<GeneratedPost> {
  const selectedPairs = input.imitateImages === false ? [] : input.imagePairs.slice(0, maxViralImages);
  const imageTasks = selectedPairs.map((pair, index): SourceImageTask => ({
    id: `viral-image-${index + 1}`,
    url: pair.material.referenceMaterialPath,
    referenceUrls: [pair.sourceImageUrl],
    kind: "source_image",
    label: `viral pair ${index + 1}`,
    selected: true,
    mode: "wash",
    prompt: buildViralImagePrompt(input.targetKeyword, input.settings, pair.sourceSpec),
    provider: "openai_images",
    strategyKey: resolveViralImageStrategyKey(pair.sourceSpec),
  }));
  if (input.imitateImages !== false && !imageTasks.length) throw new Error("No paired vehicle material and viral source images were found for viral image generation");

  if (input.imitateImages !== false) {
    await recordViralImageTaskPlan({
      pairs: selectedPairs,
      imageTasks,
    });
  }

  const sourceForDraft: NormalizedSourceItem = {
    ...input.source.item,
    contentText: buildViralTextBrief(input.source, input.targetKeyword),
    productionPlan: {
      ...buildProductionPlan(input.source.item),
      decision: "adopt",
      textStrategy: "creative_reframe_with_xpeng",
      imageStrategy: input.imitateImages === false ? "none" : "creative_analysis_rebuild_with_xpeng_assets",
      materialRequirements: {
        vehicleDocs: false,
        vehicleImages: input.imitateImages !== false,
        sourceImages: false,
        videoKeyframes: false,
        videoPublicPoints: false,
      },
      promptGuidance: {
        textBrief: `Learn the viral structure and rewrite it for ${input.targetKeyword}. Do not invent vehicle parameters.`,
        imageBrief:
          input.imitateImages === false
            ? "Generate text only; do not request viral-style image imitation."
            : `Use ordered local ${input.targetKeyword} vehicle images as image 1 and viral source images as image 2 composition and style references; never publish original viral images.`,
      },
    },
  };
  return generatePost({
    source: sourceForDraft,
    materialPaths: input.materialPaths,
    instruction: buildViralTextInstruction(input.settings.textInstruction, input.source.style, input.targetKeyword),
    imageTasks: input.imitateImages === false ? undefined : imageTasks,
  });
}

export async function recordViralImageTaskPlan(input: {
  runId?: string;
  pairs: ViralImageReferencePair[];
  imageTasks: SourceImageTask[];
}) {
  const selectedTasks = input.imageTasks.filter((task) => task.selected);
  await recordExecutionLog({
    scope: "viral/replication",
    action: "Plan viral image tasks",
    status: "info",
    message: `Prepared ${selectedTasks.length} viral image edit task(s) with ordered vehicle and source references.`,
    details: {
      ...(input.runId ? { runId: input.runId } : {}),
      taskCount: selectedTasks.length,
      pairedImageCount: input.pairs.length,
      referenceShape: selectedTasks.length ? "images/edits" : "none",
      strategies: selectedTasks.map((task) => task.strategyKey || "unknown").join(",") || "none",
      materialFiles: input.pairs.map((pair) => pair.material.name).filter(Boolean).join(",") || "none",
      sourceSlots: input.pairs.map((pair) => pair.index + 1).join(",") || "none",
      promptLengths: selectedTasks.map((task) => task.prompt.length).join(",") || "none",
    },
  });
}

export function scoreMaterialMatch(spec: ViralImageSpec, profile: MaterialVisualProfile, targetKeyword: string) {
  let score = 0;
  const normalizedTarget = normalizeText(targetKeyword);
  const hasVehicleKeyword = normalizedTarget && profile.vehicleKeywords.some((item) => normalizedTarget.includes(normalizeText(item)) || normalizeText(item).includes(normalizedTarget));
  if (hasVehicleKeyword) score += 35;
  if (normalizedTarget && !hasVehicleKeyword) score -= 20;
  if (profile.imageType === spec.imageType) score += 18;
  if (profile.vehiclePart === spec.vehiclePart) score += 22;
  if (profile.angle === spec.angle) score += 14;
  if (profile.shotSize === spec.shotSize) score += 8;
  if (profile.hasPeople === spec.hasPeople) score += 5;
  if (profile.hasText === spec.hasText) score += 3;
  if (profile.quality === "high") score += 8;
  if (profile.quality === "low") score -= 10;
  return Math.max(score, 0);
}

export function stripViralBodyHashtags(value?: string) {
  if (!value?.trim()) return "";
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(stripViralHashtagsFromLine)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildStyleAnalysis(item: NormalizedSourceItem, imageCount: number, targetKeyword: string): ViralStyleAnalysis {
  const bodyText = stripViralBodyHashtags(item.contentText);
  const text = [item.title, bodyText].filter(Boolean).join("\n");
  const paragraphs = bodyText.split(/\n+/).map((part) => part.trim()).filter(Boolean);
  return {
    titlePattern: item.title ? `Mirror title rhythm from: ${item.title}` : "Short social title",
    paragraphCount: Math.max(paragraphs.length, text ? 1 : 0),
    approximateLength: text.length,
    tone: inferTone(text),
    structure: paragraphs.length > 1 ? "multi-paragraph social post" : "short social note",
    interactionPattern: /[?？]/.test(text) ? "question-driven" : "statement-driven",
    imageCount,
    imageRhythm: imageCount ? `Keep ${imageCount} image slots in source order` : "text-first",
    sourceBrandCandidates: inferBrandCandidates(text, targetKeyword),
  };
}

async function analyzeSingleViralImage(sourceUrl: string, index: number, image: ModelImageInput): Promise<ViralImageSpec> {
  const fallback = inferImageSpec(sourceUrl, index);
  const json = await callViralImageVisionModel(buildViralImageAnalysisPrompt(fallback), [image]);
  return normalizeViralImageSpec(json, fallback);
}

function buildViralImageAnalysisPrompt(fallback: ViralImageSpec) {
  return [
    "You are a senior automotive social-media art director. Analyze the provided viral source image and output strict JSON only.",
    "The source image is only a visual style sample. Do not suggest copying source brands, original text, watermarks, license plates, people identity, or the exact source image.",
    "Infer a reusable image-generation style prompt that can be applied to a different local vehicle/product reference image.",
    "Return fields: imageType, shotSize, vehiclePart, angle, composition, hasPeople, hasText, colorPalette, recommendedStrategy, stylePrompt, aestheticKeywords, confidence.",
    "Allowed imageType values: photo, info_card, poster, comparison, screenshot, unknown.",
    "Allowed shotSize values: wide, medium, close, detail, unknown.",
    "Allowed vehiclePart values: full_vehicle, front, side, rear, interior, wheel, light, screen, detail, unknown.",
    "Allowed angle values: front, front_three_quarter, side, rear, rear_three_quarter, top, interior, unknown.",
    "Allowed recommendedStrategy values: car_reference, people_with_car, text_image, keep_layout.",
    "For stylePrompt, write one dense English prompt phrase covering aesthetic style, lighting, color grading, camera/lens feel, composition, depth, texture, and social-media finish.",
    "For poster/info/card images, set recommendedStrategy to text_image and describe layout hierarchy without copying source wording.",
    `Fallback slot guess: ${JSON.stringify(fallback)}`,
  ].join("\n");
}

async function callViralImageVisionModel(prompt: string, images: ModelImageInput[]): Promise<Record<string, unknown>> {
  if (!appConfig.openaiApiKey) throw new Error("OPENAI_API_KEY is not configured for viral image style analysis");
  const text =
    appConfig.openaiTextEndpoint === "chat"
      ? await callViralImageChatCompletions(prompt, images)
      : await callViralImageResponsesApi(prompt, images);
  return parseJsonObject(text);
}

async function callViralImageResponsesApi(prompt: string, images: ModelImageInput[]) {
  const content = [
    { type: "input_text", text: prompt },
    ...images.map((image) => ({
      type: "input_image",
      image_url: image.imageUrl,
    })),
  ];
  const response = await runWithConcurrencyPool("gpt", () =>
    fetch(openaiTextUrl("responses"), {
      method: "POST",
      headers: openaiHeaders(),
      body: JSON.stringify({
        model: appConfig.openaiTextModel,
        input: [
          {
            role: "user",
            content,
          },
        ],
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
    throw new Error(`OpenAI viral image analysis request failed: ${response.status} ${body.slice(0, 260)}`);
  }

  const data = (await response.json()) as ResponsesApiTextResponse;
  return (
    data.output_text ||
    data.output?.flatMap((item) => item.content || []).find((contentItem) => typeof contentItem.text === "string")?.text ||
    "{}"
  );
}

async function callViralImageChatCompletions(prompt: string, images: ModelImageInput[]) {
  const content = [
    { type: "text", text: prompt },
    ...images.map((image) => ({
      type: "image_url",
      image_url: {
        url: image.imageUrl,
      },
    })),
  ];
  const response = await runWithConcurrencyPool("gpt", () =>
    fetch(openaiTextUrl("chat/completions"), {
      method: "POST",
      headers: openaiHeaders(),
      body: JSON.stringify({
        model: appConfig.openaiTextModel,
        messages: [
          {
            role: "system",
            content: "You only output valid JSON. Do not output Markdown.",
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
    throw new Error(`OpenAI viral image chat analysis request failed: ${response.status} ${body.slice(0, 260)}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  return data.choices?.[0]?.message?.content || "{}";
}

function normalizeViralImageSpec(json: Record<string, unknown>, fallback: ViralImageSpec): ViralImageSpec {
  const stylePrompt = stringFromJson(json.stylePrompt, "");
  if (!stylePrompt) {
    throw new Error("Viral image style analysis did not return stylePrompt");
  }
  return {
    ...fallback,
    imageType: enumFromJson(json.imageType, viralImageTypes, fallback.imageType),
    shotSize: enumFromJson(json.shotSize, viralShotSizes, fallback.shotSize),
    vehiclePart: enumFromJson(json.vehiclePart, viralVehicleParts, fallback.vehiclePart),
    angle: enumFromJson(json.angle, viralAngles, fallback.angle),
    composition: stringFromJson(json.composition, fallback.composition),
    hasPeople: booleanFromJson(json.hasPeople, fallback.hasPeople),
    hasText: booleanFromJson(json.hasText, fallback.hasText),
    colorPalette: stringFromJson(json.colorPalette, fallback.colorPalette),
    stylePrompt,
    aestheticKeywords: arrayOfStrings(json.aestheticKeywords).slice(0, 8),
    confidence: normalizeConfidence(json.confidence),
    recommendedStrategy: enumFromJson(json.recommendedStrategy, viralStrategies, fallback.recommendedStrategy),
  };
}

function inferImageSpec(sourceUrl: string, index: number): ViralImageSpec {
  const text = normalizeText(sourceUrl);
  const hasText = /poster|card|info|text|海报|文字|参数|配置/.test(text);
  const hasPeople = /people|person|model|美女|人物|车主/.test(text);
  const vehiclePart = inferVehiclePart(text);
  return {
    id: `viral-source-image-${index + 1}`,
    index,
    sourceUrl,
    imageType: hasText ? "poster" : "photo",
    shotSize: vehiclePart === "detail" || vehiclePart === "wheel" || vehiclePart === "light" || vehiclePart === "screen" ? "detail" : "medium",
    vehiclePart,
    angle: inferAngle(text, vehiclePart),
    composition: "Follow the source image framing, subject placement, and visual hierarchy.",
    hasPeople,
    hasText,
    colorPalette: "source visual palette pending analysis",
    stylePrompt: "",
    aestheticKeywords: [],
    recommendedStrategy: hasPeople ? "people_with_car" : hasText ? "text_image" : "car_reference",
  };
}

function inferMaterialProfile(materialPath: string, targetKeyword: string): MaterialVisualProfile {
  void targetKeyword;
  const text = normalizeText([materialPath, path.basename(materialPath)].join(" "));
  const vehiclePart = inferVehiclePart(text);
  return {
    source: "filename",
    vehicleKeywords: tokenizeKeywords(path.basename(materialPath, path.extname(materialPath))),
    imageType: /poster|card|info|海报|文字|参数|配置/.test(text) ? "poster" : "photo",
    shotSize: vehiclePart === "detail" || vehiclePart === "wheel" || vehiclePart === "light" || vehiclePart === "screen" ? "detail" : "medium",
    vehiclePart,
    angle: inferAngle(text, vehiclePart),
    hasPeople: /people|person|model|美女|人物|车主/.test(text),
    hasText: /poster|card|info|海报|文字|参数|配置/.test(text),
    quality: /blur|low|糊|低清/.test(text) ? "low" : "high",
    indexedAt: new Date().toISOString(),
  };
}

function buildViralTextInstruction(baseInstruction: string, style: ViralStyleAnalysis, targetKeyword: string) {
  return [
    baseInstruction,
    `Viral rewrite target keyword: ${targetKeyword}.`,
    `Title pattern: ${style.titlePattern}.`,
    `Structure: ${style.structure}; paragraphs: ${style.paragraphCount}; tone: ${style.tone}.`,
    "Only learn structure, rhythm, and expression. Replace source brand/product mentions with the target keyword. Do not invent vehicle specs or factual parameters.",
  ].filter(Boolean).join("\n");
}

function buildViralTextBrief(source: ViralSourceAnalysis, targetKeyword: string) {
  const bodyText = stripViralBodyHashtags(source.item.contentText);
  return [
    `Viral source title: ${source.item.title || ""}`,
    `Viral source body: ${bodyText}`,
    `Target keyword: ${targetKeyword}`,
    `Style summary: ${JSON.stringify(source.style)}`,
  ].join("\n");
}

function stripViralHashtagsFromLine(line: string) {
  return line
    .replace(/(^|[\s,.;:!?，。！？；、])#[^#\s,.;:!?，。！？；、]+(?:\[[^\]]+\])?#/g, "$1")
    .replace(/(^|[\s,.;:!?，。！？；、])#[^\s#，,。！？!?:;；、]+/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+([,.;:!?，。！？；、])/g, "$1")
    .trim();
}

function resolveViralImageStrategyKey(sourceSpec?: ViralImageSpec): keyof WorkspacePromptSettings["imageStrategyPrompts"] {
  if (sourceSpec?.recommendedStrategy === "people_with_car") return "peopleWithCar";
  if (sourceSpec?.recommendedStrategy === "text_image" || sourceSpec?.recommendedStrategy === "keep_layout") return "textImage";
  return "carExterior";
}

function resolveViralImageStrategyPrompt(settings: WorkspacePromptSettings, sourceSpec?: ViralImageSpec) {
  const strategyKey = resolveViralImageStrategyKey(sourceSpec);
  return settings.imageStrategyPrompts[strategyKey] || defaultImageStrategyPrompts[strategyKey];
}

function buildViralImagePrompt(targetKeyword: string, settings: WorkspacePromptSettings, sourceSpec?: ViralImageSpec) {
  const strategyPrompt = resolveViralImageStrategyPrompt(settings, sourceSpec);
  return [
    appConfig.viralImageImitationPrompt,
    strategyPrompt,
    `Target vehicle/product keyword: ${targetKeyword}.`,
    "Reference image 1 is the user-provided target vehicle image. Reference image 2 is the viral source style image.",
    "Use reference image 1 for vehicle identity, body shape, trim, lights, wheels, and visible details.",
    "Use reference image 2 for composition, camera distance, subject placement, scene atmosphere, lighting, color grading, and visual rhythm.",
    "Adapt the source layout and viewpoint to the target vehicle instead of copying the exact source pixels.",
    sourceSpec?.stylePrompt ? `Analyzed artistic style from reference image 2: ${sourceSpec.stylePrompt}.` : "",
    sourceSpec?.composition ? `Source composition guidance: ${sourceSpec.composition}.` : "",
    sourceSpec?.colorPalette ? `Source color palette guidance: ${sourceSpec.colorPalette}.` : "",
    sourceSpec?.aestheticKeywords?.length ? `Source aesthetic keywords: ${sourceSpec.aestheticKeywords.join(", ")}.` : "",
    "Do not publish, copy, or reproduce the original viral source image.",
    "Do not copy source brand marks, original text, watermarks, license plates, or exact image content.",
  ].filter(Boolean).join("\n");
}

function inferVehiclePart(text: string): ViralImageSpec["vehiclePart"] {
  if (/interior|inside|内饰|座舱|中控|屏/.test(text)) return /screen|屏/.test(text) ? "screen" : "interior";
  if (/front|前脸|车头|大灯/.test(text)) return /light|灯/.test(text) ? "light" : "front";
  if (/side|侧面|侧颜/.test(text)) return "side";
  if (/rear|尾部|车尾|尾灯/.test(text)) return /light|灯/.test(text) ? "light" : "rear";
  if (/wheel|轮毂|轮胎/.test(text)) return "wheel";
  if (/detail|细节/.test(text)) return "detail";
  return "full_vehicle";
}

function inferAngle(text: string, vehiclePart: ViralImageSpec["vehiclePart"]): ViralImageSpec["angle"] {
  if (vehiclePart === "interior" || vehiclePart === "screen") return "interior";
  if (/front.*45|three.*quarter|前.*45|斜前/.test(text)) return "front_three_quarter";
  if (/rear.*45|斜后/.test(text)) return "rear_three_quarter";
  if (/side|侧/.test(text)) return "side";
  if (/rear|尾|后/.test(text)) return "rear";
  if (/top|俯视/.test(text)) return "top";
  return "front";
}

function inferTone(text: string) {
  if (/[!！]{2,}|冲|炸|绝了|爆/.test(text)) return "high-energy";
  if (/测评|实测|参数|配置/.test(text)) return "analytical";
  if (/我|我们|体验|入手/.test(text)) return "first-person";
  return "conversational";
}

function inferBrandCandidates(text: string, targetKeyword: string) {
  return tokenizeKeywords(text).filter((item) => item !== targetKeyword).slice(0, 8);
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

function stringFromJson(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function booleanFromJson(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function enumFromJson<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
}

function normalizeConfidence(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(Math.max(parsed, 0), 1);
}

function tokenizeKeywords(text: string) {
  return Array.from(new Set(text.split(/[\s,，。/\\_-]+/).map((item) => item.trim()).filter((item) => item.length >= 2))).slice(0, 12);
}

function normalizeText(text: string) {
  return text.toLowerCase();
}
