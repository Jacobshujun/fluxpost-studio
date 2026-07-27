import type { ImageGenerationOptions } from "./types";

export type ToApisImageSize = {
  size: string;
  resolution: "1k" | "2k" | "4k";
};

export const toApisImageRatios = ["1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "21:9", "9:21"] as const;
export const toApis4kImageRatios = ["16:9", "9:16", "2:1", "1:2", "21:9", "9:21"] as const;
export const maxToApisReferenceImages = 16;
export const maxToApisImageOutputs = 10;

export type ToApisImageRatio = (typeof toApisImageRatios)[number];
export type ToApisImageResolution = ToApisImageSize["resolution"];
export type ToApisImageOutputFormat = "png" | "jpeg";

export type ToApisImageTask = {
  id?: string;
  task_id?: string;
  status?: string;
  progress?: number;
  url?: string;
  result?: {
    data?: Array<{ url?: string }>;
  };
  error?: {
    code?: string | number;
    message?: string;
  };
};

const toApisImageSizeByPixels: Record<string, ToApisImageSize> = {
  auto: { size: "1:1", resolution: "1k" },
  "1024x1024": { size: "1:1", resolution: "1k" },
  "1024x1536": { size: "2:3", resolution: "1k" },
  "1536x1024": { size: "3:2", resolution: "1k" },
  "2048x2048": { size: "1:1", resolution: "2k" },
  "2048x1152": { size: "16:9", resolution: "2k" },
  "1152x2048": { size: "9:16", resolution: "2k" },
  "3840x2160": { size: "16:9", resolution: "4k" },
  "2160x3840": { size: "9:16", resolution: "4k" },
  // Historical FluxPost drafts used this custom size; ToAPIs previously normalized it to 1K.
  "1200x1600": { size: "3:4", resolution: "1k" },
};

export function resolveToApisImageSize(requestedSize: ImageGenerationOptions["size"]): ToApisImageSize {
  const mapped = toApisImageSizeByPixels[requestedSize];
  if (!mapped) {
    throw new Error(`ToAPIs does not have an explicit size mapping for ${requestedSize}. Select a listed image-size preset.`);
  }
  return mapped;
}

export function buildToApisGenerationBody(input: {
  model: string;
  prompt: string;
  requestedSize?: ImageGenerationOptions["size"];
  ratio?: string;
  resolution?: string;
  quality?: string;
  count?: number;
  outputFormat?: string;
  outputCompression?: number;
  referenceImages?: string[];
}) {
  const dimensions = input.ratio || input.resolution
    ? validateToApisDimensions(input.ratio, input.resolution)
    : resolveToApisImageSize(input.requestedSize || "auto");
  const referenceImages = (input.referenceImages || []).filter(Boolean);
  if (referenceImages.length > maxToApisReferenceImages) {
    throw new Error(`ToAPIs accepts at most ${maxToApisReferenceImages} reference images; received ${referenceImages.length}.`);
  }
  const count = validateIntegerRange(input.count ?? 1, 1, maxToApisImageOutputs, "ToAPIs image count");
  const quality = validateChoice(input.quality || "medium", ["low", "medium", "high"], "ToAPIs image quality");
  const outputFormat = validateChoice(input.outputFormat || "png", ["png", "jpeg"], "ToAPIs output format") as ToApisImageOutputFormat;
  const outputCompression = validateIntegerRange(input.outputCompression ?? 100, 0, 100, "ToAPIs JPEG compression");
  return {
    model: input.model,
    prompt: input.prompt,
    n: count,
    size: dimensions.size,
    resolution: dimensions.resolution,
    quality,
    output_format: outputFormat,
    ...(outputFormat === "jpeg" ? { output_compression: outputCompression } : {}),
    response_format: "url" as const,
    ...(referenceImages.length ? { image_urls: referenceImages } : {}),
  };
}

export function validateToApisDimensions(ratio?: string, resolution?: string): ToApisImageSize {
  if (!toApisImageRatios.includes(ratio as ToApisImageRatio)) throw new Error(`ToAPIs image ratio is invalid: ${ratio || "(empty)"}.`);
  if (resolution !== "1k" && resolution !== "2k" && resolution !== "4k") {
    throw new Error(`ToAPIs image resolution is invalid: ${resolution || "(empty)"}.`);
  }
  if (resolution === "4k" && !toApis4kImageRatios.includes(ratio as (typeof toApis4kImageRatios)[number])) {
    throw new Error(`ToAPIs 4K does not support image ratio ${ratio}.`);
  }
  return { size: ratio as ToApisImageRatio, resolution };
}

function validateIntegerRange(value: number, min: number, max: number, label: string) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  return value;
}

function validateChoice(value: string, choices: readonly string[], label: string) {
  if (!choices.includes(value)) throw new Error(`${label} is invalid: ${value}.`);
  return value;
}

export function requireToApisTaskId(task: ToApisImageTask) {
  const taskId = task.id || task.task_id;
  if (!taskId) throw new Error("ToAPIs image submission response did not include a task id.");
  return taskId;
}

export function getToApisCompletedImageUrls(task: ToApisImageTask) {
  const urls = (task.result?.data || []).map((item) => item.url).filter((url): url is string => Boolean(url));
  if (task.url) urls.push(task.url);
  return Array.from(new Set(urls));
}

export function formatToApisTaskError(task: ToApisImageTask) {
  const code = task.error?.code ? `${task.error.code}: ` : "";
  return `${code}${task.error?.message || "ToAPIs image task failed without an error message."}`;
}

export function parseRetryAfterMs(value: string | null, now = Date.now()) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);
  const date = Date.parse(value);
  return Number.isFinite(date) && date > now ? date - now : undefined;
}
