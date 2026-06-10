import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { compactError, recordExecutionLog } from "./activity-log";
import { appConfig, openaiImageApiKey, openaiImageUrl, type OpenaiImageApiRoute } from "./config";
import { concurrencyConfig, mapWithConcurrency, runWithConcurrencyPool } from "./concurrency";
import { buildSingleImageTaskPrompt } from "./creation-controls";
import { buildMediaRequestHeaders } from "./media-request";
import type { ImageGenerationOptions, SourceImageTask } from "./types";

type ResponsesImageResponse = {
  output?: Array<{
    type?: string;
    result?: string;
  }>;
};

type ImagesApiResponse = {
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
};

type PreparedReferenceImage = {
  filePath: string;
  fileName: string;
  mimeType: string;
  bytes: number;
};

const maxImageAttempts = 3;
const imageRequestTimeoutMs = appConfig.openaiImageRequestTimeoutMs;
const remoteReferenceTimeoutMs = 30_000;
const referenceImageMaxSidePx = 2400;
const referenceImageNormalizeTimeoutMs = 60_000;
const retryableImageStatuses = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const defaultImageOptions: ImageGenerationOptions = {
  size: "1024x1536",
  quality: "medium",
};
let activeStandardImagesApiRoute: OpenaiImageApiRoute = "primary";

type PreparedReferenceImages = {
  values: string[];
  fallbackValues: string[];
  files: PreparedReferenceImage[];
  localCount: number;
  remoteCount: number;
  encodedCount: number;
  mode: "url" | "base64" | "mixed" | "data_url" | "file" | "none";
};

type SelectedImageTaskResult = {
  imageUrls: string[];
  failedTask?: string;
};

export async function generateImagesFromPrompt(
  prompt: string,
  count = 1,
  imageTasks?: SourceImageTask[],
  options?: Partial<ImageGenerationOptions>,
) {
  if (!isImageProviderConfigured()) {
    return {
      status: "needs_config" as const,
      imageUrls: [] as string[],
      message: "OPENAI_IMAGE_API_KEY or OPENAI_API_KEY is not configured.",
    };
  }

  const imageOptions = normalizeImageOptions(options);
  const providerPrompt = normalizeProviderPrompt(prompt);
  const selectedTasks = (imageTasks || []).filter((task) => task.selected);
  if (selectedTasks.length) {
    const selectedTaskConcurrency = imageOptions.taskConcurrency || 1;
    if (selectedTaskConcurrency > 0) {
      const taskResults = await mapWithConcurrency(
        selectedTasks.map((task, index) => ({ task, index })),
        selectedTaskConcurrency,
        ({ task, index }) => runSelectedImageTask(providerPrompt, task, index, selectedTasks.length, imageOptions),
      );
      const imageUrls = taskResults.flatMap((result) => result.imageUrls);
      const failedTasks = taskResults.map((result) => result.failedTask).filter((item): item is string => Boolean(item));

      if (!imageUrls.length && failedTasks.length) {
        throw new Error(`All image tasks failed: ${failedTasks.join("; ")}`);
      }

      return {
        status: "completed" as const,
        imageUrls,
      };
    }

    const imageUrls: string[] = [];
    const failedTasks: string[] = [];
    for (const [index, task] of selectedTasks.entries()) {
      await recordExecutionLog({
        scope: "openai/image",
        action: "逐张图片任务开始",
        status: "running",
        message: `正在处理 ${task.label}（${index + 1}/${selectedTasks.length}）`,
        details: {
          mode: task.mode,
          kind: task.kind,
          size: imageOptions.size,
          quality: imageOptions.quality,
        },
      });
      if (task.mode === "keep") {
        imageUrls.push(task.url);
        await recordExecutionLog({
          scope: "openai/image",
          action: "保持原图",
          status: "info",
          message: `${task.label} 已直接使用原图，未调用图片模型`,
          details: {
            label: task.label,
            kind: task.kind,
          },
        });
        continue;
      }

      const taskPrompt = buildSingleImageTaskPrompt(providerPrompt, task);
      try {
        const taskUrls =
          appConfig.openaiImageEndpoint === "images"
            ? await callImagesApi(taskPrompt, 1, imageOptions, [task.url])
            : await callResponsesImageTool(taskPrompt, 1, imageOptions);
        imageUrls.push(...taskUrls);
      } catch (error) {
        const message = compactError(error);
        if (isImageTaskSourceFallbackError(error)) {
          imageUrls.push(task.url);
          await recordExecutionLog({
            scope: "openai/image",
            action: isImageTaskTimeoutError(error) ? "Image task timed out; using source image" : "Image task failed; using source image",
            status: "info",
            message: `${task.label} image provider failed temporarily, so the original source image is used for this slot: ${message}`,
            details: {
              label: task.label,
              mode: task.mode,
              kind: task.kind,
              fallbackUrl: task.url,
              error: message,
            },
          });
          continue;
        }

        failedTasks.push(`${task.label}: ${message}`);
        await recordExecutionLog({
          scope: "openai/image",
          action: "单张图片任务失败",
          status: "error",
          message,
          details: {
            label: task.label,
            mode: task.mode,
            kind: task.kind,
          },
        });
      }
    }

    if (!imageUrls.length && failedTasks.length) {
      throw new Error(`所有图片任务都失败：${failedTasks.join("；")}`);
    }

    return {
      status: "completed" as const,
      imageUrls,
    };
  }

  if (!providerPrompt) {
    await recordExecutionLog({
      scope: "openai/image",
      action: "Image generation skipped",
      status: "info",
      message: "Image prompt is empty and no selected source image task is available, so no provider request was submitted.",
      details: {
        provider: appConfig.openaiImageEndpoint,
        count,
        selectedTaskCount: 0,
      },
    });
    return {
      status: "completed" as const,
      imageUrls: [] as string[],
      message: "Image prompt is empty; skipped image generation.",
    };
  }

  const imageUrls =
    appConfig.openaiImageEndpoint === "images"
      ? await callImagesApi(providerPrompt, count, imageOptions)
      : await callResponsesImageTool(providerPrompt, count, imageOptions);

  return {
    status: "completed" as const,
    imageUrls,
  };
}

async function runSelectedImageTask(
  prompt: string,
  task: SourceImageTask,
  index: number,
  total: number,
  imageOptions: ImageGenerationOptions,
): Promise<SelectedImageTaskResult> {
  await recordExecutionLog({
    scope: "openai/image",
    action: "Image task started",
    status: "running",
    message: `Processing ${task.label} (${index + 1}/${total})`,
    details: {
      mode: task.mode,
      kind: task.kind,
      size: imageOptions.size,
      quality: imageOptions.quality,
      taskConcurrency: imageOptions.taskConcurrency || 1,
    },
  });

  if (task.mode === "keep") {
    await recordExecutionLog({
      scope: "openai/image",
      action: "Keep source image",
      status: "info",
      message: `${task.label} uses the original source image without calling the image model.`,
      details: {
        label: task.label,
        kind: task.kind,
      },
    });
    return {
      imageUrls: [task.url],
    };
  }

  const taskPrompt = buildSingleImageTaskPrompt(prompt, task);
  try {
    const taskUrls =
      appConfig.openaiImageEndpoint === "images"
        ? await callImagesApi(taskPrompt, 1, imageOptions, [task.url])
        : await callResponsesImageTool(taskPrompt, 1, imageOptions);
    return {
      imageUrls: taskUrls,
    };
  } catch (error) {
    const message = compactError(error);
    if (isImageTaskSourceFallbackError(error)) {
      const fallbackTimeoutMs = resolveImageTaskFallbackTimeoutMs();
      const isTimeout = isImageTaskTimeoutError(error);
      await recordExecutionLog({
        scope: "openai/image",
        action: isTimeout ? "Image task timed out; using source image" : "Image task failed; using source image",
        status: "info",
        message: isTimeout
          ? `${task.label} exceeded ${Math.round(fallbackTimeoutMs / 1000)} seconds, so the original source image is used for this slot.`
          : `${task.label} image provider failed temporarily, so the original source image is used for this slot: ${message}`,
        details: {
          label: task.label,
          mode: task.mode,
          kind: task.kind,
          fallbackUrl: task.url,
          ...(isTimeout ? { timeoutMs: fallbackTimeoutMs } : { error: message }),
        },
      });
      return {
        imageUrls: [task.url],
      };
    }

    await recordExecutionLog({
      scope: "openai/image",
      action: "Image task failed",
      status: "error",
      message,
      details: {
        label: task.label,
        mode: task.mode,
        kind: task.kind,
      },
    });
    return {
      imageUrls: [],
      failedTask: `${task.label}: ${message}`,
    };
  }
}

async function callResponsesImageTool(prompt: string, count: number, options: ImageGenerationOptions) {
  return runWithConcurrencyPool("image", () => callResponsesImageToolInPool(prompt, count, options));
}

async function callResponsesImageToolInPool(prompt: string, count: number, options: ImageGenerationOptions) {
  const startedAt = Date.now();
  await recordExecutionLog({
    scope: "openai/image",
    action: "请求 Responses 图片工具",
    status: "running",
    message: "准备通过 image_generation 工具生成图片",
    details: {
      model: appConfig.openaiImageModel,
      count,
      promptLength: prompt.length,
      size: options.size,
      quality: options.quality,
    },
  });
  const response = await fetchWithTimeout(openaiImageUrl("responses"), {
    method: "POST",
    headers: openaiImageHeaders(),
    body: JSON.stringify({
      model: appConfig.openaiTextModel,
      input: prompt,
      tools: [
        {
          type: "image_generation",
          model: appConfig.openaiImageModel,
        },
      ],
      tool_choice: { type: "image_generation" },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    await recordExecutionLog({
      scope: "openai/image",
      action: "Responses 图片工具失败",
      status: "error",
      message: compactError(`OpenAI image request failed: ${response.status} ${body.slice(0, 260)}`),
      durationMs: Date.now() - startedAt,
      details: {
        status: response.status,
        model: appConfig.openaiImageModel,
      },
    });
    throw new Error(`OpenAI image request failed: ${response.status} ${body.slice(0, 260)}`);
  }

  const data = await readJsonResponse<ResponsesImageResponse>(response, "Responses image tool");
  const base64Images = (data.output || [])
    .filter((item) => item.type === "image_generation_call" && typeof item.result === "string")
    .map((item) => item.result as string)
    .slice(0, count);

  const imageUrls = await saveBase64Images(base64Images);
  await recordExecutionLog({
    scope: "openai/image",
    action: "Responses 图片工具完成",
    status: "success",
    message: `图片工具返回 ${imageUrls.length} 张本地图片`,
    durationMs: Date.now() - startedAt,
    details: {
      imageCount: imageUrls.length,
      model: appConfig.openaiImageModel,
    },
  });
  return imageUrls;
}

async function callImagesApi(prompt: string, count: number, options: ImageGenerationOptions, referenceImages: string[] = []) {
  return runWithConcurrencyPool("image", () => callImagesApiInPool(prompt, count, options, referenceImages));
}

async function callImagesApiInPool(prompt: string, count: number, options: ImageGenerationOptions, referenceImages: string[] = []) {
  const startedAt = Date.now();
  const preparedReferences = await prepareReferenceImages(referenceImages);
  await recordExecutionLog({
    scope: "openai/image",
    action: "请求 Images 图片模型",
    status: "running",
    message: "准备通过 images/generations 生成图片",
    details: {
      model: appConfig.openaiImageModel,
      count,
      promptLength: prompt.length,
      referenceImageCount: preparedReferences.values.length,
      localReferenceCount: preparedReferences.localCount,
      remoteReferenceCount: preparedReferences.remoteCount,
      encodedReferenceCount: preparedReferences.encodedCount,
      referenceMode: preparedReferences.mode,
      size: options.size,
      quality: options.quality,
    },
  });

  const data = await requestImagesApiWithRetry(prompt, count, startedAt, options, preparedReferences);
  const base64Images = (data.data || []).map((item) => item.b64_json).filter((item): item is string => Boolean(item));
  const remoteUrls = (data.data || []).map((item) => item.url).filter((item): item is string => Boolean(item));
  const imageUrls = [...(await saveBase64Images(base64Images)), ...remoteUrls].slice(0, count);
  await recordExecutionLog({
    scope: "openai/image",
    action: "Images 图片模型完成",
    status: "success",
    message: `图片模型返回 ${imageUrls.length} 张图片`,
    durationMs: Date.now() - startedAt,
    details: {
      imageCount: imageUrls.length,
      model: appConfig.openaiImageModel,
      size: options.size,
      quality: options.quality,
    },
  });
  return imageUrls;
}

async function requestStandardImagesApiWithRetry(
  prompt: string,
  count: number,
  startedAt: number,
  options: ImageGenerationOptions,
  referenceImages: PreparedReferenceImages,
): Promise<ImagesApiResponse> {
  const endpointPath = referenceImages.files.length ? "images/edits" : "images/generations";
  const data: NonNullable<ImagesApiResponse["data"]> = [];

  try {
    for (let index = 0; index < Math.max(1, Math.floor(count)); index += 1) {
      const response = await requestSingleStandardImagesApiWithRetry(prompt, startedAt, options, referenceImages, endpointPath);
      data.push(...(response.data || []).slice(0, 1));
    }

    return { data };
  } finally {
    await cleanupPreparedReferenceImages(referenceImages);
  }
}

async function requestSingleStandardImagesApiWithRetry(
  prompt: string,
  startedAt: number,
  options: ImageGenerationOptions,
  referenceImages: PreparedReferenceImages,
  endpointPath: "images/edits" | "images/generations",
): Promise<ImagesApiResponse> {
  const triedRoutes = new Set<OpenaiImageApiRoute>();
  let route = resolveActiveStandardImagesApiRoute();

  while (true) {
    try {
      const response = await requestSingleStandardImagesApiWithRetryForRoute(route, prompt, Date.now(), options, referenceImages, endpointPath);
      activeStandardImagesApiRoute = route;
      return response;
    } catch (error) {
      triedRoutes.add(route);
      const nextRoute = resolveNextStandardImagesApiRoute(route, triedRoutes, error);
      if (!nextRoute) {
        restorePrimaryStandardImagesApiRouteAfterBackupFailure(route, error);
        throw error;
      }

      await recordExecutionLog({
        scope: "openai/image",
        action: nextRoute === "backup" ? "Images API failover to backup" : "Images API failover to primary",
        status: "info",
        message:
          nextRoute === "backup"
            ? "Primary image API failed, so the next image request attempt will use the backup image API."
            : "Backup image API failed, so the next image request attempt will use the primary image API.",
        durationMs: Date.now() - startedAt,
        details: {
          failedRoute: route,
          nextRoute,
          endpointPath,
          error: compactError(error),
        },
      });

      activeStandardImagesApiRoute = nextRoute;
      route = nextRoute;
    }
  }
}

async function requestSingleStandardImagesApiWithRetryForRoute(
  route: OpenaiImageApiRoute,
  prompt: string,
  startedAt: number,
  options: ImageGenerationOptions,
  referenceImages: PreparedReferenceImages,
  endpointPath: "images/edits" | "images/generations",
): Promise<ImagesApiResponse> {
  let lastError = "";
  let sendQuality = Boolean(options.quality);
  let sendInputFidelity = endpointPath === "images/edits";
  const deadline = startedAt + imageRequestTimeoutMs;

  for (let attempt = 1; attempt <= maxImageAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        openaiImageUrl(endpointPath, route),
        await buildStandardImagesApiRequest(route, prompt, options, referenceImages.files, sendQuality, sendInputFidelity),
        getRemainingTimeoutMs(deadline),
      );
    } catch (error) {
      lastError = compactError(error);
      const shouldRetryTimeout = attempt < maxImageAttempts && hasRetryWindow(deadline);
      await recordExecutionLog({
        scope: "openai/image",
        action: shouldRetryTimeout ? "Images API request timeout retry" : "Images API request timed out",
        status: shouldRetryTimeout ? "info" : "error",
        message: shouldRetryTimeout ? `${lastError}; retrying ${attempt + 1}/${maxImageAttempts}.` : lastError,
        durationMs: Date.now() - startedAt,
        details: {
          status: 0,
          model: appConfig.openaiImageModel,
          route,
          endpointPath,
          attempt,
          size: options.size,
          quality: sendQuality ? options.quality : "omitted",
          referenceMode: referenceImages.mode,
        },
      });
      if (!shouldRetryTimeout) throw new Error(lastError);
      await sleepWithinDeadline(getImageRetryDelayMs(attempt), deadline);
      continue;
    }

    const body = await response.text();
    if (response.ok) return parseJsonResponse<ImagesApiResponse>(body, response, "Images API");

    lastError = `OpenAI image request failed: ${response.status} ${body.slice(0, 260)}`;
    const qualityRejected = sendQuality && isUnsupportedQualityError(response.status, body);
    const inputFidelityRejected = sendInputFidelity && isUnsupportedInputFidelityError(response.status, body);
    const uploadRejected = referenceImages.files.length > 0 && isImageUploadError(response.status, body);
    const shouldRetry = attempt < maxImageAttempts && hasRetryWindow(deadline) && isRetryableImageError(response.status, body);
    await recordExecutionLog({
      scope: "openai/image",
      action: inputFidelityRejected
        ? "Images edit fidelity parameter fallback"
        : uploadRejected
        ? "Images reference upload failed"
        : qualityRejected
        ? "Images quality parameter fallback"
        : shouldRetry
        ? "Images API retry queued"
        : "Images API failed",
      status: inputFidelityRejected || uploadRejected || qualityRejected || shouldRetry ? "info" : "error",
      message: inputFidelityRejected
        ? compactError(`${lastError}; retrying without input_fidelity.`)
        : qualityRejected
        ? compactError(`${lastError}; retrying without quality.`)
        : shouldRetry
        ? compactError(`${lastError}; retrying ${attempt + 1}/${maxImageAttempts}.`)
        : compactError(lastError),
      durationMs: Date.now() - startedAt,
      details: {
        status: response.status,
        model: appConfig.openaiImageModel,
        route,
        endpointPath,
        attempt,
        size: options.size,
        quality: sendQuality ? options.quality : "omitted",
        referenceMode: referenceImages.mode,
      },
    });

    if (inputFidelityRejected) {
      sendInputFidelity = false;
      continue;
    }
    if (uploadRejected) throw new Error(lastError);
    if (qualityRejected) {
      sendQuality = false;
      continue;
    }
    if (!shouldRetry) throw new Error(lastError);
    await sleepWithinDeadline(getImageRetryDelayMs(attempt), deadline);
  }

  throw new Error(lastError || "OpenAI image request failed");
}

async function buildStandardImagesApiRequest(
  route: OpenaiImageApiRoute,
  prompt: string,
  options: ImageGenerationOptions,
  referenceImages: PreparedReferenceImage[],
  sendQuality: boolean,
  sendInputFidelity: boolean,
): Promise<RequestInit> {
  if (!referenceImages.length) {
    return {
      method: "POST",
      headers: openaiImageHeaders(true, route),
      body: JSON.stringify(buildStandardImagesGenerationBody(prompt, options, sendQuality)),
    };
  }

  const form = new FormData();
  form.append("model", appConfig.openaiImageModel);
  form.append("prompt", prompt);
  form.append("n", "1");
  form.append("size", options.size);
  form.append("output_format", "png");
  form.append("response_format", "b64_json");
  if (sendQuality) form.append("quality", options.quality);
  if (sendInputFidelity) form.append("input_fidelity", "high");

  for (const referenceImage of referenceImages.slice(0, 1)) {
    const file = await readFile(referenceImage.filePath);
    form.append("image", new Blob([new Uint8Array(file)], { type: referenceImage.mimeType }), referenceImage.fileName);
  }

  return {
    method: "POST",
    headers: openaiImageHeaders(false, route),
    body: form,
  };
}

function buildStandardImagesGenerationBody(prompt: string, options: ImageGenerationOptions, sendQuality: boolean) {
  return {
    model: appConfig.openaiImageModel,
    prompt,
    n: 1,
    size: options.size,
    ...(sendQuality ? { quality: options.quality } : {}),
    output_format: "png",
    response_format: "b64_json",
  };
}

async function requestImagesApiWithRetry(
  prompt: string,
  count: number,
  startedAt: number,
  options: ImageGenerationOptions,
  referenceImages: PreparedReferenceImages,
): Promise<ImagesApiResponse> {
  return requestStandardImagesApiWithRetry(prompt, count, startedAt, options, referenceImages);
}

async function readJsonResponse<T>(response: Response, label: string): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();
  return parseJsonResponse<T>(body, response, label, contentType);
}

function parseJsonResponse<T>(body: string, response: Response, label: string, contentType = response.headers.get("content-type") || ""): T {
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`${label} returned non-JSON response: ${response.status} ${contentType} ${body.slice(0, 180)}`);
  }

  try {
    return JSON.parse(body) as T;
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error instanceof Error ? error.message : "parse failed"}`);
  }
}

function isRetryableImageError(status: number, body: string) {
  if (/cannot fulfill this request/i.test(body)) return false;
  if (retryableImageStatuses.has(status)) return true;
  return /upstream_error|excessive system load|overloaded|temporarily unavailable|timeout|rate limit/i.test(body);
}

function isUnsupportedQualityError(status: number, body: string) {
  return status === 400 && /quality|unknown parameter|unsupported|invalid.*parameter|unrecognized/i.test(body);
}

function isUnsupportedInputFidelityError(status: number, body: string) {
  return status === 400 && /input_fidelity|fidelity|unknown parameter|unsupported|invalid.*parameter|unrecognized/i.test(body);
}

function isImageUploadError(status: number, body: string) {
  return status === 400 && /image upload failed|check the image|invalid image|failed to download|download image/i.test(body);
}

function resolveActiveStandardImagesApiRoute(): OpenaiImageApiRoute {
  if (activeStandardImagesApiRoute === "backup" && isStandardImagesApiRouteConfigured("backup")) return "backup";
  if (isStandardImagesApiRouteConfigured("primary")) return "primary";
  if (isStandardImagesApiRouteConfigured("backup")) return "backup";
  return "primary";
}

function resolveNextStandardImagesApiRoute(
  currentRoute: OpenaiImageApiRoute,
  triedRoutes: Set<OpenaiImageApiRoute>,
  error: unknown,
): OpenaiImageApiRoute | null {
  if (!isStandardImagesApiFailoverError(error)) return null;
  const candidate: OpenaiImageApiRoute = currentRoute === "primary" ? "backup" : "primary";
  if (triedRoutes.has(candidate)) return null;
  return isStandardImagesApiRouteConfigured(candidate) ? candidate : null;
}

function restorePrimaryStandardImagesApiRouteAfterBackupFailure(route: OpenaiImageApiRoute, error: unknown) {
  if (route === "backup" && isStandardImagesApiFailoverError(error)) {
    activeStandardImagesApiRoute = "primary";
  }
}

function isStandardImagesApiRouteConfigured(route: OpenaiImageApiRoute) {
  if (route === "backup") return Boolean(appConfig.openaiImageBackupBaseUrl && appConfig.openaiImageBackupApiKey);
  return Boolean(openaiImageApiKey(route));
}

function isStandardImagesApiFailoverError(error: unknown) {
  const message = compactError(error);
  if (/cannot fulfill this request|content policy|safety|moderation|image upload failed|check the image|invalid image|failed to download|download image/i.test(message)) {
    return false;
  }
  return (
    /OpenAI image request failed:\s*(?:401|403|404|408|409|425|429|50[0234])\b/i.test(message) ||
    /Images API returned (?:non-JSON|invalid JSON)/i.test(message) ||
    /request timed out|timed out after|time-?out|timeout|abort|fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT|ECONNREFUSED/i.test(message) ||
    /upstream_error|excessive system load|overloaded|temporarily unavailable|rate limit|Gateway Time-?out|Bad Gateway|Service Unavailable/i.test(message)
  );
}

function openaiImageHeaders(json = true, route: OpenaiImageApiRoute = "primary") {
  return {
    Authorization: `Bearer ${openaiImageApiKey(route)}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function isImageProviderConfigured() {
  if (appConfig.openaiImageEndpoint === "images") {
    return isStandardImagesApiRouteConfigured("primary") || isStandardImagesApiRouteConfigured("backup");
  }
  return Boolean(appConfig.openaiImageApiKey);
}

async function prepareReferenceImages(referenceImages: string[]): Promise<PreparedReferenceImages> {
  const values: string[] = [];
  const fallbackValues: string[] = [];
  const files: PreparedReferenceImage[] = [];
  let localCount = 0;
  let remoteCount = 0;
  let encodedCount = 0;

  for (const referenceImage of referenceImages.filter(Boolean)) {
    const localFile = resolvePublicFilePath(referenceImage);
    if (localFile) {
      const normalizedFile = await normalizeReferenceImageFile(localFile);
      const file = await readFile(normalizedFile);
      const base64 = file.toString("base64");
      values.push(base64);
      fallbackValues.push(`data:${getImageMimeType(normalizedFile)};base64,${base64}`);
      files.push({
        filePath: normalizedFile,
        fileName: path.basename(normalizedFile),
        mimeType: getImageMimeType(normalizedFile),
        bytes: file.length,
      });
      localCount += 1;
      encodedCount += 1;
      continue;
    }

    if (/^https?:\/\//i.test(referenceImage)) {
      const remoteFile = await materializeRemoteReferenceImage(referenceImage).catch(async (error) => {
        await recordExecutionLog({
          scope: "openai/image",
          action: "Remote reference image resize skipped",
          status: "info",
          message: `Could not resize remote reference image before image-model request: ${compactError(error)}`,
          details: {
            referenceImage,
          },
        });
        return null;
      });
      if (remoteFile) {
        const file = await readFile(remoteFile);
        const base64 = file.toString("base64");
        values.push(base64);
        fallbackValues.push(`data:${getImageMimeType(remoteFile)};base64,${base64}`);
        files.push({
          filePath: remoteFile,
          fileName: path.basename(remoteFile),
          mimeType: getImageMimeType(remoteFile),
          bytes: file.length,
        });
        remoteCount += 1;
        encodedCount += 1;
        continue;
      }
    }

    values.push(referenceImage);
    remoteCount += /^https?:\/\//i.test(referenceImage) ? 1 : 0;
  }

  return {
    values,
    fallbackValues,
    files,
    localCount,
    remoteCount,
    encodedCount,
    mode: files.length ? "file" : resolveReferenceMode(encodedCount, values.length - encodedCount),
  };
}

async function cleanupPreparedReferenceImages(referenceImages: PreparedReferenceImages) {
  await Promise.all(referenceImages.files.map((file) => rm(file.filePath, { force: true }).catch(() => undefined)));
}

function resolvePublicFilePath(value: string) {
  if (!value.startsWith("/")) return null;
  const cleanPath = decodeURIComponent(value.split("?")[0] || "").replace(/^\/+/, "");
  const publicRoot = path.resolve(process.cwd(), "public");
  const filePath = path.resolve(publicRoot, cleanPath);
  if (filePath !== publicRoot && filePath.startsWith(`${publicRoot}${path.sep}`)) return filePath;
  return null;
}

function getImageMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "image/png";
}

async function materializeRemoteReferenceImage(url: string) {
  const response = await fetchWithTimeout(
    url,
    {
      headers: buildMediaRequestHeaders(url),
    },
    remoteReferenceTimeoutMs,
  );
  if (!response.ok) {
    throw new Error(`remote image download failed: HTTP ${response.status}`);
  }

  const mimeType = normalizeMimeType(response.headers.get("content-type"), url);
  if (!mimeType.startsWith("image/")) {
    throw new Error(`remote file is not an image (${mimeType})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) {
    throw new Error("remote image is empty");
  }
  if (buffer.length > 12 * 1024 * 1024) {
    throw new Error(`remote image is too large (${buffer.length} bytes)`);
  }

  const rawFile = await writeReferenceInputBuffer(buffer, mimeType);
  try {
    return await normalizeReferenceImageFile(rawFile);
  } finally {
    await rm(rawFile, { force: true }).catch(() => undefined);
  }
}

async function normalizeReferenceImageFile(filePath: string) {
  const startedAt = Date.now();
  const outputDir = path.join(process.cwd(), "public", "generated", "image-inputs");
  await mkdir(outputDir, { recursive: true });

  const outputFile = path.join(outputDir, `reference-${Date.now()}-${randomUUID()}.jpg`);
  try {
    await runImageResize(filePath, outputFile);
  } catch (error) {
    await rm(outputFile, { force: true }).catch(() => undefined);
    throw new Error(`reference image resize failed: ${compactError(error)}`);
  }

  await recordExecutionLog({
    scope: "openai/image",
    action: "Reference image resized",
    status: "info",
    message: `Reference image normalized before model input; longest side is capped at ${referenceImageMaxSidePx}px.`,
    durationMs: Date.now() - startedAt,
    details: {
      inputFile: path.basename(filePath),
      outputFile: path.basename(outputFile),
      maxSidePx: referenceImageMaxSidePx,
    },
  });

  return outputFile;
}

async function writeReferenceInputBuffer(buffer: Buffer, mimeType: string) {
  const outputDir = path.join(process.cwd(), "public", "generated", "image-inputs");
  await mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `remote-reference-${Date.now()}-${randomUUID()}.${extensionFromMimeType(mimeType)}`);
  await writeFile(filePath, buffer);
  return filePath;
}

function runImageResize(inputFile: string, outputFile: string) {
  return new Promise<void>((resolve, reject) => {
    const child = execFile(
      "ffmpeg",
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        inputFile,
        "-vf",
        `scale=${referenceImageMaxSidePx}:${referenceImageMaxSidePx}:force_original_aspect_ratio=decrease`,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        outputFile,
      ],
      { timeout: referenceImageNormalizeTimeoutMs },
      (error, _stdout, stderr) => {
        if (error) {
          const detail = stderr?.toString().trim().split(/\r?\n/).slice(-2).join(" ") || error.message;
          reject(new Error(detail.slice(0, 240)));
          return;
        }
        resolve();
      },
    );
    child.on("error", reject);
  });
}

function extensionFromMimeType(mimeType: string) {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "png";
}

function normalizeMimeType(contentType: string | null, url: string) {
  const mimeType = contentType?.split(";")[0]?.trim().toLowerCase();
  if (mimeType) return mimeType;
  const cleanUrl = url.split("?")[0] || "";
  if (/\.jpe?g$/i.test(cleanUrl)) return "image/jpeg";
  if (/\.webp$/i.test(cleanUrl)) return "image/webp";
  if (/\.gif$/i.test(cleanUrl)) return "image/gif";
  return "image/png";
}

function resolveReferenceMode(encodedCount: number, urlCount: number): PreparedReferenceImages["mode"] {
  if (encodedCount && urlCount) return "mixed";
  if (encodedCount) return "base64";
  if (urlCount) return "url";
  return "none";
}

function normalizeImageOptions(options?: Partial<ImageGenerationOptions>): ImageGenerationOptions {
  return {
    size: normalizeImageSize(options?.size),
    quality: normalizeImageQuality(options?.quality),
    taskConcurrency: normalizeTaskConcurrency(options?.taskConcurrency),
  };
}

function normalizeProviderPrompt(prompt: string) {
  return typeof prompt === "string" ? prompt.trim() : "";
}

function normalizeImageSize(value?: string) {
  const normalized = (value || defaultImageOptions.size).trim().toLowerCase().replace(/\s+/g, "").replace(/×/g, "x");
  if (normalized === "auto") return "auto";
  if (!/^\d{2,5}x\d{2,5}$/.test(normalized)) return defaultImageOptions.size;

  const [width, height] = normalized.split("x").map((item) => Number(item));
  if (!Number.isFinite(width) || !Number.isFinite(height) || !width || !height) return defaultImageOptions.size;

  const allowed = ["1024x1024", "1536x1024", "1024x1536", "1536x864", "3840x2160"];
  if (allowed.includes(normalized)) return normalized;

  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.12) return "1024x1024";
  if (ratio > 1.6) return width >= 3000 ? "3840x2160" : "1536x864";
  if (ratio > 1) return "1536x1024";
  return "1024x1536";
}

function normalizeImageQuality(value?: string): ImageGenerationOptions["quality"] {
  return value === "low" || value === "medium" || value === "high" ? value : defaultImageOptions.quality;
}

function normalizeTaskConcurrency(value?: number) {
  if (typeof value === "undefined") return 1;
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) return 1;
  return Math.min(Math.max(Math.floor(candidate), 1), concurrencyConfig.image);
}

function getImageRetryDelayMs(attempt: number) {
  return attempt === 1 ? 3500 : 9000;
}

function isImageTaskTimeoutError(error: unknown) {
  const message = compactError(error);
  return /timed out after|request timed out|time-?out|timeout|abort/i.test(message);
}

function isImageTaskSourceFallbackError(error: unknown) {
  if (isImageTaskTimeoutError(error)) return true;
  const message = compactError(error);
  return /\b(?:408|409|425|429|50[0234])\b|Gateway Time-?out|Bad Gateway|Service Unavailable|upstream_error|excessive system load|overloaded|temporarily unavailable|rate limit/i.test(message);
}

function resolveImageTaskFallbackTimeoutMs() {
  return imageRequestTimeoutMs;
}

function getRemainingTimeoutMs(deadline: number, capMs = imageRequestTimeoutMs, timeoutMsForMessage = imageRequestTimeoutMs) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new Error(`Image task timed out after ${Math.round(timeoutMsForMessage / 1000)}s.`);
  }
  return Math.max(1, Math.min(capMs, remaining));
}

function hasRetryWindow(deadline: number) {
  return deadline - Date.now() > 1_000;
}

async function sleepWithinDeadline(ms: number, deadline: number) {
  if (!hasRetryWindow(deadline)) return;
  await sleep(Math.min(ms, Math.max(0, deadline - Date.now() - 250)));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = imageRequestTimeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function saveBase64Images(base64Images: string[]) {
  const generatedDir = path.join(process.cwd(), "public", "generated");
  await mkdir(generatedDir, { recursive: true });

  const imageUrls: string[] = [];
  for (const [index, image] of base64Images.entries()) {
    const fileName = `image-${Date.now()}-${randomUUID()}-${index + 1}.png`;
    await writeFile(path.join(generatedDir, fileName), Buffer.from(image, "base64"));
    imageUrls.push(`/generated/${fileName}`);
  }

  return imageUrls;
}
