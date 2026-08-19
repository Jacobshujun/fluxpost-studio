import { appConfig } from "../config";

const allowedRatios = new Set(["1:1", "3:4", "16:9", "4:3", "9:16", "21:9"]);
const allowedResolutions = new Set(["720p", "1080p"]);
const succeededStatuses = new Set(["success", "succeeded", "completed"]);
const failedStatuses = new Set(["fail", "failed", "error", "cancelled", "canceled"]);

export class ArkSeedanceNeedsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArkSeedanceNeedsConfigError";
  }
}

export type ArkSeedanceSubmission = {
  taskId: string;
  status: string;
  videoUrls: string[];
  raw: Record<string, unknown>;
};

export type ArkSeedanceSubmitInput = {
  prompt: string;
  images: string[];
  videos: string[];
  duration: number;
  ratio: string;
  resolution: string;
  generateAudio: boolean;
  watermark: boolean;
};

export function getArkSeedanceReadiness() {
  const apiKey = appConfig.arkApiKey.trim();
  const model = appConfig.arkSeedanceModel.trim();
  if (!apiKey) throw new ArkSeedanceNeedsConfigError("ARK_API_KEY is required for Seedance 2.5.");
  if (!model) throw new ArkSeedanceNeedsConfigError("ARK_SEEDANCE_MODEL is required for Seedance 2.5.");
  return { model };
}

export async function submitArkSeedanceVideo(input: ArkSeedanceSubmitInput): Promise<ArkSeedanceSubmission> {
  validateArkSeedanceInput(input);
  const { model } = getArkSeedanceReadiness();
  const raw = await requestArkSeedance("contents/generations/tasks", {
    method: "POST",
    body: JSON.stringify({
      model,
      content: [
        { type: "text", text: input.prompt.trim() },
        ...input.images.map((url) => ({ type: "image_url", image_url: { url }, role: "reference_image" })),
        ...input.videos.map((url) => ({ type: "video_url", video_url: { url }, role: "reference_video" })),
      ],
      generate_audio: input.generateAudio,
      ratio: input.ratio,
      duration: input.duration,
      resolution: input.resolution,
      watermark: input.watermark,
    }),
  });
  return normalizeArkSeedanceSubmission(raw);
}

export async function queryArkSeedanceVideo(taskId: string): Promise<ArkSeedanceSubmission> {
  const id = taskId.trim();
  if (!id) throw new Error("Ark Seedance task ID is required.");
  getArkSeedanceReadiness();
  const raw = await requestArkSeedance(`contents/generations/tasks/${encodeURIComponent(id)}`, { method: "GET" });
  return normalizeArkSeedanceSubmission(raw, id);
}

export function validateArkSeedanceInput(input: ArkSeedanceSubmitInput) {
  if (!input.prompt.trim()) throw new Error("Seedance prompt is required.");
  if (input.prompt.length > 2000) throw new Error("Seedance prompt must be 2000 characters or fewer.");
  if (!Number.isInteger(input.duration) || input.duration < 4 || input.duration > 15) {
    throw new Error("Seedance duration must be 4-15 seconds.");
  }
  if (!allowedRatios.has(input.ratio)) throw new Error("Unsupported Seedance ratio.");
  if (!allowedResolutions.has(input.resolution)) throw new Error("Unsupported Seedance resolution.");
  if (input.images.length > 9) throw new Error("Seedance accepts at most 9 images.");
  if (input.videos.length > 3) throw new Error("Seedance accepts at most 3 videos.");
  if (input.images.length + input.videos.length > 12) throw new Error("Seedance accepts at most 12 mixed media files.");
  input.images.forEach((url) => validateMediaReference(url, ["jpg", "jpeg", "png", "webp", "bmp", "tiff", "gif"], "image"));
  input.videos.forEach((url) => validateMediaReference(url, ["mp4", "mov"], "video"));
}

async function requestArkSeedance(path: string, init: RequestInit) {
  const url = `${appConfig.arkBaseUrl}/${path.replace(/^\/+/, "")}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${appConfig.arkApiKey}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(appConfig.arkSeedanceRequestTimeoutMs),
    });
  } catch (error) {
    if (isAbortTimeoutError(error)) {
      throw new Error(`Ark Seedance request timed out after ${Math.round(appConfig.arkSeedanceRequestTimeoutMs / 1000)}s.`);
    }
    throw error;
  }
  const body = await response.text();
  const raw = parseJsonObject(body);
  if (!response.ok) {
    const message = providerErrorMessage(raw) || body.trim().slice(0, 500) || `HTTP ${response.status}`;
    if (response.status === 401 || response.status === 403) {
      throw new ArkSeedanceNeedsConfigError(`Ark Seedance authorization failed: ${message}`);
    }
    throw new Error(`Ark Seedance request failed (${response.status}): ${message}`);
  }
  return raw;
}

function normalizeArkSeedanceSubmission(raw: Record<string, unknown>, fallbackId = ""): ArkSeedanceSubmission {
  const taskId = stringValue(raw.id) || fallbackId;
  if (!taskId) throw new Error("Ark Seedance did not return a task ID; the task was not accepted.");
  const status = (stringValue(raw.status) || "queued").toLowerCase();
  if (failedStatuses.has(status)) {
    throw new Error(providerErrorMessage(raw) || `Ark Seedance task ${taskId} failed with status ${status}.`);
  }
  const content = recordValue(raw.content);
  const videoUrl = stringValue(content.video_url);
  if (succeededStatuses.has(status) && !videoUrl) {
    throw new Error(`Ark Seedance task ${taskId} succeeded without a video URL.`);
  }
  return { taskId, status, videoUrls: videoUrl ? [videoUrl] : [], raw };
}

function providerErrorMessage(raw: Record<string, unknown>) {
  const error = raw.error;
  if (typeof error === "string") return error.trim();
  const errorObject = recordValue(error);
  const message = stringValue(errorObject.message) || stringValue(raw.message);
  const code = stringValue(errorObject.code) || stringValue(raw.code);
  return [code, message].filter(Boolean).join(": ");
}

function parseJsonObject(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return recordValue(parsed);
  } catch {
    return {};
  }
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validateMediaReference(value: string, extensions: string[], label: string) {
  const reference = value.trim();
  if (!reference) throw new Error(`Seedance ${label} reference is empty.`);
  let url: URL;
  try {
    url = new URL(reference);
  } catch {
    throw new Error(`Seedance ${label} reference must be a public HTTP(S) URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Seedance ${label} reference must be a public HTTP(S) URL.`);
  }
  const pathname = url.pathname.toLowerCase();
  if (!extensions.some((extension) => pathname.endsWith(`.${extension}`))) {
    throw new Error(`Seedance ${label} must use one of: ${extensions.join(", ")}.`);
  }
}

function isAbortTimeoutError(error: unknown) {
  return error instanceof Error
    && (error.name === "TimeoutError" || error.name === "AbortError" || /aborted due to timeout|operation was aborted/i.test(error.message));
}
