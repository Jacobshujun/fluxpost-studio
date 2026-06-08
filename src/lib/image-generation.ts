import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { compactError, recordExecutionLog } from "./activity-log";
import { appConfig, openaiImageUrl, runningHubUrl } from "./config";
import { concurrencyConfig, mapWithConcurrency, runWithConcurrencyPool } from "./concurrency";
import { buildSingleImageTaskPrompt } from "./creation-controls";
import { buildMediaRequestHeaders } from "./media-request";
import { openaiHeaders } from "./openai";
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

type RunningHubTaskResponse = {
  taskId?: string;
  status?: "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED" | string;
  errorCode?: string;
  errorMessage?: string;
  results?: Array<{
    url?: string | null;
    outputType?: string | null;
    text?: string | null;
  }> | null;
  failedReason?: unknown;
  message?: string;
};

type RunningHubUploadResponse = {
  code?: number;
  message?: string;
  data?: {
    type?: string;
    download_url?: string;
    fileName?: string;
    size?: string;
  } | null;
};

const maxImageAttempts = 3;
const imageRequestTimeoutMs = 180_000;
const remoteReferenceTimeoutMs = 30_000;
const runningHubRequestTimeoutMs = 120_000;
const referenceImageMaxSidePx = 2400;
const referenceImageNormalizeTimeoutMs = 60_000;
const retryableImageStatuses = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const defaultImageOptions: ImageGenerationOptions = {
  size: "1200x1600",
  quality: "medium",
};

type PreparedReferenceImages = {
  values: string[];
  fallbackValues: string[];
  localCount: number;
  remoteCount: number;
  encodedCount: number;
  mode: "url" | "base64" | "mixed" | "data_url" | "none";
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
      message:
        appConfig.openaiImageEndpoint === "runninghub"
          ? "RUNNINGHUB_API_KEY is not configured."
          : "OPENAI_API_KEY is not configured.",
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
          appConfig.openaiImageEndpoint === "runninghub"
            ? await callRunningHubImageApi(taskPrompt, 1, imageOptions, [task.url])
            : appConfig.openaiImageEndpoint === "images"
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
    appConfig.openaiImageEndpoint === "runninghub"
      ? await callRunningHubImageApi(providerPrompt, count, imageOptions)
      : appConfig.openaiImageEndpoint === "images"
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
      appConfig.openaiImageEndpoint === "runninghub"
        ? await callRunningHubImageApi(taskPrompt, 1, imageOptions, [task.url])
        : appConfig.openaiImageEndpoint === "images"
        ? await callImagesApi(taskPrompt, 1, imageOptions, [task.url])
        : await callResponsesImageTool(taskPrompt, 1, imageOptions);
    return {
      imageUrls: taskUrls,
    };
  } catch (error) {
    const message = compactError(error);
    if (isImageTaskSourceFallbackError(error)) {
      const isTimeout = isImageTaskTimeoutError(error);
      await recordExecutionLog({
        scope: "openai/image",
        action: isTimeout ? "Image task timed out; using source image" : "Image task failed; using source image",
        status: "info",
        message: isTimeout
          ? `${task.label} exceeded 180 seconds, so the original source image is used for this slot.`
          : `${task.label} image provider failed temporarily, so the original source image is used for this slot: ${message}`,
        details: {
          label: task.label,
          mode: task.mode,
          kind: task.kind,
          fallbackUrl: task.url,
          ...(isTimeout ? { timeoutMs: imageRequestTimeoutMs } : { error: message }),
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
    headers: openaiHeaders(),
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

async function callRunningHubImageApi(
  prompt: string,
  count: number,
  options: ImageGenerationOptions,
  referenceImages: string[] = [],
) {
  return runWithConcurrencyPool("image", () => callRunningHubImageApiInPool(prompt, count, options, referenceImages));
}

async function callRunningHubImageApiInPool(
  prompt: string,
  count: number,
  options: ImageGenerationOptions,
  referenceImages: string[] = [],
) {
  const startedAt = Date.now();
  const deadline = startedAt + imageRequestTimeoutMs;
  const inputImageUrls = await prepareRunningHubImageUrls(referenceImages, deadline);
  const endpointPath = inputImageUrls.length ? appConfig.runningHubImageToImagePath : appConfig.runningHubTextToImagePath;
  const aspectRatio = resolveRunningHubAspectRatio(options.size);
  const resolution = resolveRunningHubResolution(options.quality);

  await recordExecutionLog({
    scope: "runninghub/image",
    action: "提交 RunningHub 图片任务",
    status: "running",
    message: inputImageUrls.length ? "准备通过 RunningHub G-2 图生图生成图片" : "准备通过 RunningHub G-2 文生图生成图片",
    details: {
      provider: "runninghub",
      endpointPath,
      count,
      promptLength: prompt.length,
      referenceImageCount: inputImageUrls.length,
      aspectRatio,
      resolution,
    },
  });

  const submitted = await postRunningHubJson<RunningHubTaskResponse>(
    endpointPath,
    {
      prompt,
      ...(inputImageUrls.length ? { imageUrls: inputImageUrls.slice(0, 10) } : {}),
      aspectRatio,
      resolution,
    },
    getRemainingTimeoutMs(deadline),
  );

  const taskId = submitted.taskId;
  if (!taskId) {
    throw new Error(`RunningHub image task did not return taskId: ${JSON.stringify(submitted).slice(0, 260)}`);
  }

  const completed = await waitForRunningHubTask(taskId, startedAt, deadline);
  const imageUrls = (completed.results || [])
    .map((item) => item.url)
    .filter((url): url is string => Boolean(url))
    .slice(0, count);

  await recordExecutionLog({
    scope: "runninghub/image",
    action: "RunningHub 图片任务完成",
    status: imageUrls.length ? "success" : "info",
    message: `RunningHub 返回 ${imageUrls.length} 张图片`,
    durationMs: Date.now() - startedAt,
    details: {
      taskId,
      imageCount: imageUrls.length,
      status: completed.status || null,
      aspectRatio,
      resolution,
    },
  });

  if (!imageUrls.length) {
    throw new Error(`RunningHub task ${taskId} completed without image URLs.`);
  }

  return imageUrls;
}

async function waitForRunningHubTask(taskId: string, startedAt: number, deadline: number): Promise<RunningHubTaskResponse> {
  let lastStatus = "";

  while (Date.now() < deadline) {
    const data = await postRunningHubJson<RunningHubTaskResponse>(appConfig.runningHubQueryPath, { taskId }, getRemainingTimeoutMs(deadline));
    lastStatus = String(data.status || "").toUpperCase();

    if (lastStatus === "SUCCESS") return data;
    if (lastStatus === "FAILED") {
      throw new Error(
        `RunningHub task ${taskId} failed: ${data.errorMessage || data.message || JSON.stringify(data.failedReason || {}).slice(0, 260)}`,
      );
    }

    await recordExecutionLog({
      scope: "runninghub/image",
      action: "RunningHub 图片任务等待",
      status: "info",
      message: `任务 ${taskId} 当前状态 ${lastStatus || "UNKNOWN"}，继续轮询`,
      durationMs: Date.now() - startedAt,
      details: {
        taskId,
        status: lastStatus || null,
      },
    });
    await sleepWithinDeadline(appConfig.runningHubPollIntervalMs, deadline);
  }

  throw new Error(`RunningHub task ${taskId} timed out after ${Math.round((deadline - startedAt) / 1000)}s; last status: ${lastStatus || "UNKNOWN"}.`);
}

async function prepareRunningHubImageUrls(referenceImages: string[], deadline: number) {
  const urls: string[] = [];
  for (const referenceImage of referenceImages.filter(Boolean)) {
    if (/^https?:\/\//i.test(referenceImage)) {
      const remoteFile = await materializeRemoteReferenceImage(referenceImage).catch(async (error) => {
        await recordExecutionLog({
          scope: "runninghub/image",
          action: "Remote reference image resize skipped",
          status: "info",
          message: `Could not resize remote reference image before RunningHub upload: ${compactError(error)}`,
          details: {
            referenceImage,
          },
        });
        return null;
      });
      if (remoteFile) {
        try {
          urls.push(await uploadRunningHubLocalFile(remoteFile, deadline));
        } finally {
          await rm(remoteFile, { force: true }).catch(() => undefined);
        }
        continue;
      }
      urls.push(referenceImage);
      continue;
    }

    const localFile = resolvePublicFilePath(referenceImage);
    if (!localFile) {
      throw new Error(`RunningHub image-to-image requires an HTTP(S) URL or app-served local media path, got: ${referenceImage}`);
    }
    const normalizedFile = await normalizeReferenceImageFile(localFile);
    try {
      urls.push(await uploadRunningHubLocalFile(normalizedFile, deadline));
    } finally {
      await rm(normalizedFile, { force: true }).catch(() => undefined);
    }
  }
  return urls;
}

async function uploadRunningHubLocalFile(filePath: string, deadline: number) {
  const startedAt = Date.now();
  const file = await readFile(filePath);
  const form = new FormData();
  const blob = new Blob([new Uint8Array(file)], { type: getImageMimeType(filePath) });
  form.append("file", blob, path.basename(filePath));

  await recordExecutionLog({
    scope: "runninghub/image",
    action: "上传 RunningHub 参考图",
    status: "running",
    message: "正在上传本地参考图到 RunningHub",
    details: {
      fileName: path.basename(filePath),
      bytes: file.length,
    },
  });

  const response = await fetchWithTimeout(
    runningHubUrl(appConfig.runningHubUploadPath),
    {
      method: "POST",
      headers: runningHubHeaders(false),
      body: form,
    },
    getRemainingTimeoutMs(deadline, runningHubRequestTimeoutMs),
  );
  const data = await readRunningHubResponse<RunningHubUploadResponse>(response, "RunningHub upload");
  if (!response.ok || data.code !== 0 || !data.data?.download_url) {
    throw new Error(`RunningHub upload failed: ${response.status} ${JSON.stringify(data).slice(0, 260)}`);
  }

  await recordExecutionLog({
    scope: "runninghub/image",
    action: "RunningHub 参考图上传完成",
    status: "success",
    message: "本地参考图已上传到 RunningHub",
    durationMs: Date.now() - startedAt,
    details: {
      fileName: path.basename(filePath),
      size: data.data.size || null,
    },
  });
  return data.data.download_url;
}

async function postRunningHubJson<T>(pathValue: string, body: Record<string, unknown>, timeoutMs = runningHubRequestTimeoutMs): Promise<T> {
  const response = await fetchWithTimeout(
    runningHubUrl(pathValue),
    {
      method: "POST",
      headers: runningHubHeaders(true),
      body: JSON.stringify(body),
    },
    timeoutMs,
  );
  const data = await readRunningHubResponse<T & { code?: number; msg?: string; message?: string }>(response, "RunningHub API");
  if (!response.ok) {
    throw new Error(`RunningHub API failed: ${response.status} ${JSON.stringify(data).slice(0, 260)}`);
  }
  if (typeof data.code === "number" && data.code !== 0) {
    throw new Error(`RunningHub API failed: ${data.code} ${data.msg || data.message || ""}`);
  }
  return data as T;
}

async function readRunningHubResponse<T>(response: Response, label: string): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();
  return parseJsonResponse<T>(body, response, label, contentType);
}

function runningHubHeaders(json: boolean) {
  return {
    Authorization: `Bearer ${appConfig.runningHubApiKey}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function requestImagesApiWithRetry(
  prompt: string,
  count: number,
  startedAt: number,
  options: ImageGenerationOptions,
  referenceImages: PreparedReferenceImages,
): Promise<ImagesApiResponse> {
  let lastError = "";
  let sendQuality = Boolean(options.quality);
  let activeReferenceImages = referenceImages.values;
  let referenceMode = referenceImages.mode;
  const deadline = startedAt + imageRequestTimeoutMs;

  for (let attempt = 1; attempt <= maxImageAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetchWithTimeout(openaiImageUrl("images/generations"), {
        method: "POST",
        headers: openaiHeaders(),
        body: JSON.stringify(buildImagesApiBody(prompt, count, options, activeReferenceImages, sendQuality)),
      }, getRemainingTimeoutMs(deadline));
    } catch (error) {
      lastError = compactError(error);
      const shouldRetryTimeout = attempt < maxImageAttempts && hasRetryWindow(deadline);
      await recordExecutionLog({
        scope: "openai/image",
        action: shouldRetryTimeout ? "Images 图片模型请求超时重试" : "Images 图片模型请求超时",
        status: shouldRetryTimeout ? "info" : "error",
        message: shouldRetryTimeout
          ? `${lastError}；准备第 ${attempt + 1}/${maxImageAttempts} 次重试`
          : lastError,
        durationMs: Date.now() - startedAt,
        details: {
          status: 0,
          model: appConfig.openaiImageModel,
          attempt,
          size: options.size,
          quality: sendQuality ? options.quality : "omitted",
          referenceMode,
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
    const uploadRejected = activeReferenceImages.length > 0 && isImageUploadError(response.status, body);
    const shouldRetry = attempt < maxImageAttempts && hasRetryWindow(deadline) && isRetryableImageError(response.status, body);
    await recordExecutionLog({
      scope: "openai/image",
      action: uploadRejected
        ? "Images 参考图上传失败"
        : qualityRejected
        ? "Images 图片质量参数回退"
        : shouldRetry
        ? "Images 图片模型等待重试"
        : "Images 图片模型失败",
      status: uploadRejected || qualityRejected || shouldRetry ? "info" : "error",
      message: uploadRejected
        ? compactError(
            referenceImages.fallbackValues.length && referenceMode !== "data_url"
              ? `${lastError}；准备改用 data URL 参考图重试`
              : lastError,
          )
        : qualityRejected
        ? compactError(`${lastError}；当前通道可能不支持 quality 参数，准备不带 quality 重试`)
        : shouldRetry
        ? compactError(`${lastError}；上游临时繁忙，准备第 ${attempt + 1}/${maxImageAttempts} 次重试`)
        : compactError(lastError),
      durationMs: Date.now() - startedAt,
      details: {
        status: response.status,
        model: appConfig.openaiImageModel,
        attempt,
        size: options.size,
        quality: sendQuality ? options.quality : "omitted",
        referenceMode,
      },
    });

    if (uploadRejected) {
      if (referenceImages.fallbackValues.length && referenceMode !== "data_url") {
        activeReferenceImages = referenceImages.fallbackValues;
        referenceMode = "data_url";
        continue;
      }
      throw new Error(lastError);
    }
    if (qualityRejected) {
      sendQuality = false;
      continue;
    }
    if (!shouldRetry) throw new Error(lastError);
    await sleepWithinDeadline(getImageRetryDelayMs(attempt), deadline);
  }

  throw new Error(lastError || "OpenAI image request failed");
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

function isImageUploadError(status: number, body: string) {
  return status === 400 && /image upload failed|check the image|invalid image|failed to download|download image/i.test(body);
}

function buildImagesApiBody(
  prompt: string,
  count: number,
  options: ImageGenerationOptions,
  referenceImages: string[],
  sendQuality: boolean,
) {
  return {
    model: appConfig.openaiImageModel,
    prompt,
    ...(referenceImages.length ? { image: referenceImages } : {}),
    n: count,
    size: options.size,
    ...(sendQuality ? { quality: options.quality } : {}),
    response_format: "b64_json",
  };
}

function isImageProviderConfigured() {
  if (appConfig.openaiImageEndpoint === "runninghub") return Boolean(appConfig.runningHubApiKey);
  return Boolean(appConfig.openaiApiKey);
}

function resolveRunningHubAspectRatio(size: string) {
  const [width, height] = size.split("x").map((item) => Number(item));
  if (!Number.isFinite(width) || !Number.isFinite(height) || !width || !height) return "3:4";

  const ratio = width / height;
  const allowed = ["1:1", "2:3", "3:2", "4:5", "5:4", "4:3", "3:4", "16:9", "9:16", "21:9", "9:21", "2:1", "1:2", "3:1", "1:3"];
  return allowed.reduce((best, item) => {
    const [candidateWidth, candidateHeight] = item.split(":").map((part) => Number(part));
    const candidateDistance = Math.abs(candidateWidth / candidateHeight - ratio);
    const bestParts = best.split(":").map((part) => Number(part));
    const bestDistance = Math.abs(bestParts[0] / bestParts[1] - ratio);
    return candidateDistance < bestDistance ? item : best;
  }, "3:4");
}

function resolveRunningHubResolution(quality: ImageGenerationOptions["quality"]) {
  if (quality === "high") return "4k";
  if (quality === "low") return "1k";
  return "2k";
}

async function prepareReferenceImages(referenceImages: string[]): Promise<PreparedReferenceImages> {
  const values: string[] = [];
  const fallbackValues: string[] = [];
  let localCount = 0;
  let remoteCount = 0;
  let encodedCount = 0;

  for (const referenceImage of referenceImages.filter(Boolean)) {
    const localFile = resolvePublicFilePath(referenceImage);
    if (localFile) {
      const normalizedFile = await normalizeReferenceImageFile(localFile);
      try {
        const file = await readFile(normalizedFile);
        const base64 = file.toString("base64");
        values.push(base64);
        fallbackValues.push(`data:${getImageMimeType(normalizedFile)};base64,${base64}`);
        localCount += 1;
        encodedCount += 1;
      } finally {
        await rm(normalizedFile, { force: true }).catch(() => undefined);
      }
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
        try {
          const file = await readFile(remoteFile);
          const base64 = file.toString("base64");
          values.push(base64);
          fallbackValues.push(`data:${getImageMimeType(remoteFile)};base64,${base64}`);
          remoteCount += 1;
          encodedCount += 1;
        } finally {
          await rm(remoteFile, { force: true }).catch(() => undefined);
        }
        continue;
      }
    }

    values.push(referenceImage);
    remoteCount += /^https?:\/\//i.test(referenceImage) ? 1 : 0;
  }

  return {
    values,
    fallbackValues,
    localCount,
    remoteCount,
    encodedCount,
    mode: resolveReferenceMode(encodedCount, values.length - encodedCount),
  };
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
  return /^\d{2,5}x\d{2,5}$/.test(normalized) ? normalized : defaultImageOptions.size;
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

function getRemainingTimeoutMs(deadline: number, capMs = imageRequestTimeoutMs) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new Error(`Image task timed out after ${Math.round(imageRequestTimeoutMs / 1000)}s.`);
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
