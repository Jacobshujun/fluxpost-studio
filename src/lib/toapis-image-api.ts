import type { ImageGenerationOptions } from "./types";

export type ToApisImageSize = {
  size: string;
  resolution: "1k" | "2k" | "4k";
};

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
  requestedSize: ImageGenerationOptions["size"];
  referenceImages?: string[];
}) {
  const dimensions = resolveToApisImageSize(input.requestedSize);
  const referenceImages = (input.referenceImages || []).filter(Boolean);
  return {
    model: input.model,
    prompt: input.prompt,
    n: 1,
    size: dimensions.size,
    resolution: dimensions.resolution,
    response_format: "url" as const,
    ...(referenceImages.length ? { reference_images: referenceImages } : {}),
  };
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
