import type { ImageGenerationOptions } from "./types";
import { ImageProviderError, validateImageBackground } from "./image-providers/contracts";

export type ToApisImageSize = {
  size: string;
  resolution: "1k" | "2k" | "4k";
};

export const toApisImageRatios = ["1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "21:9", "9:21"] as const;
export const toApisImageResolutions = ["1k", "2k", "4k"] as const;
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

export function resolveToApisImageSize(requestedSize: ImageGenerationOptions["size"]): ToApisImageSize {
  if (requestedSize === "auto") return { size: "1:1", resolution: "1k" };
  throw new ImageProviderError(
    `当前 ToAPIs 图片适配器仅支持比例和分辨率档位，无法按精确像素 ${requestedSize} 提交。请切换支持精确尺寸的图片接口，或明确选择比例和档位；不会自动替换尺寸或缩放成品。`,
    { category: "input", retryable: false, failoverAllowed: false },
  );
}

export function buildToApisGenerationBody(input: {
  model: string;
  requestFormat?: import("./image-model-options").ToApisRequestFormat;
  prompt: string;
  requestedSize?: ImageGenerationOptions["size"];
  ratio?: string;
  resolution?: string;
  quality?: string;
  count?: number;
  outputFormat?: string;
  outputCompression?: number;
  background?: ImageGenerationOptions["background"];
  referenceImages?: string[];
}) {
  const referenceImages = (input.referenceImages || []).filter(Boolean);
  if (referenceImages.length > maxToApisReferenceImages) {
    throw new Error(`ToAPIs accepts at most ${maxToApisReferenceImages} reference images; received ${referenceImages.length}.`);
  }
  if (input.requestFormat !== undefined && !["ratio", "pixels", "legacy"].includes(input.requestFormat)) {
    throw new ImageProviderError(`应用参数校验：模型 ${input.model} 的 ToAPIs 请求格式无效。`, { category: "input", retryable: false, failoverAllowed: false });
  }
  if (input.requestFormat === "pixels") {
    const background = validateImageBackground(input.background, input.outputFormat);
    if ((input.count ?? 1) !== 1) {
      throw new ImageProviderError(`应用参数校验：模型 ${input.model} 的 ToAPIs 像素接口每次请求只能生成 1 张图片。`, {
        category: "input", retryable: false, failoverAllowed: false,
      });
    }
    if (input.ratio || input.resolution) validateToApisDimensions(input.ratio, input.resolution);
    const size = input.requestedSize && input.requestedSize !== "auto" ? input.requestedSize : "1024x1024";
    if (!/^\d{2,5}x\d{2,5}$/.test(size) || size.split("x").some((value) => Number(value) < 64 || Number(value) > 8192)
      || ((input.ratio || input.resolution) && (!input.requestedSize || input.requestedSize === "auto"))) {
      throw new ImageProviderError(`应用参数校验：模型 ${input.model}，${input.resolution || "pixels"} ${input.ratio || size}，需要明确且在 64–8192 范围内的像素尺寸。`, {
        category: "input", retryable: false, failoverAllowed: false,
      });
    }
    return {
      model: input.model,
      prompt: input.prompt,
      n: 1,
      size,
      quality: validateChoice(input.quality || "high", ["low", "medium", "high", "xhigh", "max"], "ToAPIs Official image quality"),
      ...(background === "transparent" ? { background: "transparent" } : {}),
      image_urls: referenceImages,
    };
  }
  const dimensions = input.ratio || input.resolution
    ? validateToApisDimensions(input.ratio, input.resolution)
    : resolveToApisImageSize(input.requestedSize || "auto");
  if (input.requestFormat !== "legacy") {
    const background = validateImageBackground(input.background, input.outputFormat);
    if ((input.count ?? 1) !== 1) {
      throw new ImageProviderError(`应用参数校验：模型 ${input.model} 的 ToAPIs 比例接口每次请求只能生成 1 张图片。`, {
        category: "input", retryable: false, failoverAllowed: false,
      });
    }
    return {
      model: input.model,
      prompt: input.prompt,
      n: 1,
      size: dimensions.size,
      resolution: dimensions.resolution,
      quality: "high",
      ...(background === "transparent" ? { background: "transparent" } : {}),
      reference_images: referenceImages,
    };
  }
  // The older-model adapter retains its historical contract; never apply it to 2.5 or generic controls.
  if (dimensions.resolution === "4k" && !toApis4kImageRatios.includes(dimensions.size as (typeof toApis4kImageRatios)[number])) {
    throw new ImageProviderError(`应用参数校验：模型 ${input.model}，4K ${dimensions.size}：ToAPIs legacy image adapter 不支持该比例；请确认服务商请求格式。`, { category: "input", retryable: false, failoverAllowed: false });
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

export function shouldReturnPendingAfterToApisAcceptance(status: string | undefined, enabled: boolean) {
  return enabled && status !== undefined && ["pending", "queued", "in_progress"].includes(status);
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
