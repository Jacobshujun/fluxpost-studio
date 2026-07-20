import { execFile } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { compactError, recordExecutionLog } from "./activity-log";
import { isComfyUiKleinConfigured, runComfyUiKleinImageTask } from "./comfyui-klein";
import { appConfig, openaiImageApiKey, openaiImageUrl, type OpenaiImageApiRoute } from "./config";
import { concurrencyConfig, mapWithConcurrency, runWithConcurrencyPool } from "./concurrency";
import { buildSingleImageTaskPrompt } from "./creation-controls";
import { sniffImageFormat } from "./image-format";
import { defaultImageGenerationSize, normalizeImageGenerationSize } from "./image-size-options";
import { buildMediaRequestHeaders } from "./media-request";
import { persistRuntimeMedia } from "./runtime-media-storage";
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

export type ImageTaskGenerationResult = {
  taskId: string;
  taskLabel: string;
  status: "completed" | "needs_review" | "failed" | "skipped";
  endpointPath?: "images/edits" | "images/generations" | "responses" | "comfyui_klein";
  referenceImageCount: number;
  expectedReferenceImageCount?: number;
  fallbackUsed: boolean;
  message?: string;
};

const maxImageAttempts = 3;
const imageRequestTimeoutMs = appConfig.openaiImageRequestTimeoutMs;
const remoteReferenceTimeoutMs = 30_000;
const maxGeneratedImageUrlBytes = 30 * 1024 * 1024;
const referenceImageMaxSidePx = 2400;
const referenceImageNormalizeTimeoutMs = 60_000;
const retryableImageStatuses = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const defaultImageOptions: ImageGenerationOptions = {
  size: defaultImageGenerationSize,
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
  taskResult: ImageTaskGenerationResult;
};

export async function generateImagesFromPrompt(
  prompt: string,
  count = 1,
  imageTasks?: SourceImageTask[],
  options?: Partial<ImageGenerationOptions>,
) {
  const imageOptions = normalizeImageOptions(options);
  const providerPrompt = normalizeProviderPrompt(prompt);
  const selectedTasks = (imageTasks || []).filter((task) => task.selected);
  if (!selectedTasks.length && !isImageProviderConfigured()) {
    return {
      status: "needs_config" as const,
      imageUrls: [] as string[],
      message: "OPENAI_IMAGE_API_KEY or OPENAI_API_KEY is not configured.",
    };
  }

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
      const taskResultsSummary = taskResults.map((result) => result.taskResult);
      const needsReviewTasks = taskResultsSummary.filter((result) => result.status === "needs_review");

      if (!imageUrls.length && failedTasks.length) {
        throw new Error(`All image tasks failed: ${failedTasks.join("; ")}`);
      }

      return {
        status: needsReviewTasks.length ? ("needs_review" as const) : ("completed" as const),
        imageUrls,
        taskResults: taskResultsSummary,
        message: needsReviewTasks.length
          ? `Image generation saved for review: ${needsReviewTasks.map((task) => `${task.taskLabel}: ${task.message || task.status}`).join("; ")}`
          : undefined,
      };
    }

    const imageUrls: string[] = [];
    const failedTasks: string[] = [];
    const taskResultsSummary: ImageTaskGenerationResult[] = [];
    for (const [index, task] of selectedTasks.entries()) {
      await recordExecutionLog({
        scope: "openai/image",
        action: "逐张图片任务开始",
        status: "running",
        message: `正在处理 ${task.label}，${index + 1}/${selectedTasks.length}`,
        details: {
          mode: task.mode,
          kind: task.kind,
          size: imageOptions.size,
          quality: imageOptions.quality,
        },
      });
      if (task.mode === "keep") {
        const sourceImageUrl = await resolveDirectSourceImageUrl(task.url);
        imageUrls.push(sourceImageUrl);
        taskResultsSummary.push(makeTaskGenerationResult(task, "skipped", {
          referenceImageCount: 1,
          fallbackUsed: false,
          message: "Keep-mode task used the source image without calling the image model.",
        }));
        await recordExecutionLog({
          scope: "openai/image",
          action: "Keep source image",
          status: "info",
          message: `${task.label} used the original source image without calling the image model.`,
          details: {
            label: task.label,
            kind: task.kind,
            sourceUrl: task.url,
            outputUrl: sourceImageUrl,
          },
        });
        continue;
      }

      const taskPrompt = buildSingleImageTaskPrompt(providerPrompt, task);
      try {
        const taskUrls = await runImageProviderTask(taskPrompt, task, imageOptions);
        imageUrls.push(...taskUrls);
        taskResultsSummary.push(makeTaskGenerationResult(task, "completed", {
          endpointPath: resolveTaskEndpointPath(task),
          referenceImageCount: getTaskReferenceImages(task).length,
          fallbackUsed: false,
        }));
      } catch (error) {
        const message = compactError(error);
        if (isStrictDualReferenceTask(task)) {
          taskResultsSummary.push(await recordStrictTaskNeedsReview(task, message, "Strict viral image task needs review"));
          continue;
        }
        if (isImageTaskSourceFallbackError(error)) {
          const fallbackUrl = await resolveDirectSourceImageUrl(task.url);
          imageUrls.push(fallbackUrl);
          taskResultsSummary.push(makeTaskGenerationResult(task, "completed", {
            endpointPath: appConfig.openaiImageEndpoint === "images" ? "images/edits" : "responses",
            referenceImageCount: getTaskReferenceImages(task).length,
            fallbackUsed: true,
            message,
          }));
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
              outputUrl: fallbackUrl,
              error: message,
            },
          });
          continue;
        }

        failedTasks.push(`${task.label}: ${message}`);
        taskResultsSummary.push(makeTaskGenerationResult(task, "failed", {
          endpointPath: appConfig.openaiImageEndpoint === "images" ? "images/edits" : "responses",
          referenceImageCount: getTaskReferenceImages(task).length,
          fallbackUsed: false,
          message,
        }));
        await recordExecutionLog({
          scope: "openai/image",
          action: "Single image task failed",
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
      throw new Error(`All image tasks failed: ${failedTasks.join("; ")}`);
    }

    const needsReviewTasks = taskResultsSummary.filter((result) => result.status === "needs_review");
    return {
      status: needsReviewTasks.length ? ("needs_review" as const) : ("completed" as const),
      imageUrls,
      taskResults: taskResultsSummary,
      message: needsReviewTasks.length
        ? `Image generation saved for review: ${needsReviewTasks.map((task) => `${task.taskLabel}: ${task.message || task.status}`).join("; ")}`
        : undefined,
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

export async function generateImagesFromPromptList(prompts: string[], options?: Partial<ImageGenerationOptions>) {
  const imageOptions = normalizeImageOptions(options);
  const normalizedPrompts = prompts.map((prompt) => prompt.trim()).filter(Boolean).slice(0, 5);
  if (!normalizedPrompts.length) {
    return {
      status: "completed" as const,
      imageUrls: [] as string[],
      message: "No original-mode image prompts were requested.",
    };
  }

  const results = await mapWithConcurrency(normalizedPrompts, imageOptions.taskConcurrency || concurrencyConfig.image, async (prompt) =>
    generateImagesFromPrompt(prompt, 1, undefined, imageOptions),
  );
  const imageUrls = results.flatMap((result) => result.imageUrls).slice(0, 5);
  const failures = results.filter((result) => result.status !== "completed").map((result) => result.message || result.status);

  if (!imageUrls.length && failures.length) {
    return {
      status: results[0]?.status || ("needs_config" as const),
      imageUrls,
      message: failures.join("; "),
    };
  }

  return {
    status: "completed" as const,
    imageUrls,
    message: failures.length ? failures.join("; ") : undefined,
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
    const sourceImageUrl = await resolveDirectSourceImageUrl(task.url);
    await recordExecutionLog({
      scope: "openai/image",
      action: "Keep source image",
      status: "info",
      message: `${task.label} uses the original source image without calling the image model.`,
      details: {
        label: task.label,
        kind: task.kind,
        sourceUrl: task.url,
        outputUrl: sourceImageUrl,
      },
    });
    return {
      imageUrls: [sourceImageUrl],
      taskResult: makeTaskGenerationResult(task, "skipped", {
        referenceImageCount: 1,
        fallbackUsed: false,
        message: "Keep-mode task used the source image without calling the image model.",
      }),
    };
  }

  const taskPrompt = buildSingleImageTaskPrompt(prompt, task);
  try {
    const taskUrls = await runImageProviderTask(taskPrompt, task, imageOptions);
    return {
      imageUrls: taskUrls,
      taskResult: makeTaskGenerationResult(task, "completed", {
        endpointPath: resolveTaskEndpointPath(task),
        referenceImageCount: getTaskReferenceImages(task).length,
        fallbackUsed: false,
      }),
    };
  } catch (error) {
    const message = compactError(error);
    if (isStrictDualReferenceTask(task)) {
      return {
        imageUrls: [],
        taskResult: await recordStrictTaskNeedsReview(task, message, "Strict viral image task needs review"),
      };
    }
    if (shouldFallbackComfyUiKleinTask(task)) {
      const fallbackUrl = await resolveDirectSourceImageUrl(task.url);
      await recordExecutionLog({
        scope: "comfyui/klein",
        action: "ComfyUI Klein failed; using source image",
        status: "info",
        message: `${task.label} local Klein workflow failed, so the original source image is used for this slot: ${message}`,
        details: {
          label: task.label,
          mode: task.mode,
          kind: task.kind,
          strategyKey: task.strategyKey || null,
          fallbackUrl: task.url,
          outputUrl: fallbackUrl,
          error: message,
        },
      });
      return {
        imageUrls: [fallbackUrl],
        taskResult: makeTaskGenerationResult(task, "completed", {
          endpointPath: "images/edits",
          referenceImageCount: getTaskReferenceImages(task).length,
          fallbackUsed: true,
          message,
        }),
      };
    }

    if (isImageTaskSourceFallbackError(error)) {
      const fallbackTimeoutMs = resolveImageTaskFallbackTimeoutMs();
      const isTimeout = isImageTaskTimeoutError(error);
      const fallbackUrl = await resolveDirectSourceImageUrl(task.url);
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
          outputUrl: fallbackUrl,
          ...(isTimeout ? { timeoutMs: fallbackTimeoutMs } : { error: message }),
        },
      });
      return {
        imageUrls: [fallbackUrl],
        taskResult: makeTaskGenerationResult(task, "completed", {
          endpointPath: appConfig.openaiImageEndpoint === "images" ? "images/edits" : "responses",
          referenceImageCount: getTaskReferenceImages(task).length,
          fallbackUsed: true,
          message,
        }),
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
      taskResult: makeTaskGenerationResult(task, "failed", {
        endpointPath: appConfig.openaiImageEndpoint === "images" ? "images/edits" : "responses",
        referenceImageCount: getTaskReferenceImages(task).length,
        fallbackUsed: false,
        message,
      }),
    };
  }
}

async function runImageProviderTask(taskPrompt: string, task: SourceImageTask, imageOptions: ImageGenerationOptions) {
  if (task.provider === "comfyui_klein" && isComfyUiKleinConfigured()) {
    return runComfyUiKleinImageTask({ prompt: taskPrompt, task });
  }

  if (isStrictDualReferenceTask(task) && appConfig.openaiImageEndpoint !== "images") {
    throw new Error("Strict viral image imitation requires OPENAI_IMAGE_ENDPOINT=images so reference images are sent through /images/edits.");
  }

  if (!isImageProviderConfigured()) {
    throw new Error("OPENAI_IMAGE_API_KEY or OPENAI_API_KEY is not configured.");
  }

  return appConfig.openaiImageEndpoint === "images"
    ? callImagesApi(taskPrompt, 1, imageOptions, getTaskReferenceImages(task), task)
    : callResponsesImageTool(taskPrompt, 1, imageOptions);
}

function getTaskReferenceImages(task: SourceImageTask) {
  return [task.url, ...(task.referenceUrls || [])].filter(Boolean);
}

function isStrictDualReferenceTask(task: SourceImageTask) {
  return task.referencePolicy === "strict_dual_reference";
}

function makeTaskGenerationResult(
  task: SourceImageTask,
  status: ImageTaskGenerationResult["status"],
  patch: Omit<Partial<ImageTaskGenerationResult>, "taskId" | "taskLabel" | "status">,
): ImageTaskGenerationResult {
  return {
    taskId: task.id,
    taskLabel: task.label,
    status,
    referenceImageCount: patch.referenceImageCount || 0,
    expectedReferenceImageCount: isStrictDualReferenceTask(task) ? 2 : patch.expectedReferenceImageCount,
    fallbackUsed: patch.fallbackUsed === true,
    endpointPath: patch.endpointPath,
    message: patch.message,
  };
}

function resolveTaskEndpointPath(task: SourceImageTask): ImageTaskGenerationResult["endpointPath"] {
  if (task.provider === "comfyui_klein" && isComfyUiKleinConfigured()) return "comfyui_klein";
  return appConfig.openaiImageEndpoint === "images" ? "images/edits" : "responses";
}

async function recordStrictTaskNeedsReview(task: SourceImageTask, message: string, action: string) {
  const result = makeTaskGenerationResult(task, "needs_review", {
    endpointPath: resolveTaskEndpointPath(task),
    referenceImageCount: getTaskReferenceImages(task).length,
    fallbackUsed: false,
    message,
  });
  await recordExecutionLog({
    scope: "openai/image",
    action,
    status: "info",
    message: `${task.label} was saved for manual review instead of falling back to a non-viral-style image: ${message}`,
    details: {
      taskId: task.id,
      taskLabel: task.label,
      referencePolicy: task.referencePolicy || "best_effort",
      endpointPath: result.endpointPath || "unknown",
      referenceImageCount: result.referenceImageCount,
      expectedReferenceImageCount: result.expectedReferenceImageCount || 0,
      fallbackUsed: false,
      strategyKey: task.strategyKey || null,
    },
  });
  return result;
}

function shouldFallbackComfyUiKleinTask(task: SourceImageTask) {
  return task.provider === "comfyui_klein" && isComfyUiKleinConfigured() && appConfig.comfyUiKleinFailurePolicy === "fallback_source";
}

async function callResponsesImageTool(prompt: string, count: number, options: ImageGenerationOptions) {
  return runWithConcurrencyPool("image", () => callResponsesImageToolInPool(prompt, count, options));
}

async function callResponsesImageToolInPool(prompt: string, count: number, options: ImageGenerationOptions) {
  const startedAt = Date.now();
  const sizeConstrainedPrompt = buildImageSizeConstrainedPrompt(prompt, options.size);
  await recordExecutionLog({
    scope: "openai/image",
    action: "Request Responses image tool",
    status: "running",
    message: "Preparing to generate images through the image_generation tool",
    details: {
      model: appConfig.openaiImageModel,
      count,
      promptLength: sizeConstrainedPrompt.length,
      size: options.size,
      quality: options.quality,
    },
  });
  const response = await fetchWithTimeout(openaiImageUrl("responses"), {
    method: "POST",
    headers: openaiImageHeaders(),
    body: JSON.stringify({
      model: appConfig.openaiTextModel,
      input: sizeConstrainedPrompt,
      tools: [
        {
          type: "image_generation",
          model: appConfig.openaiImageModel,
          size: options.size,
        },
      ],
      tool_choice: { type: "image_generation" },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    await recordExecutionLog({
      scope: "openai/image",
      action: "Responses image tool failed",
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
    action: "Responses image tool completed",
    status: "success",
    message: `Image tool returned ${imageUrls.length} local images.`,
    durationMs: Date.now() - startedAt,
    details: {
      imageCount: imageUrls.length,
      model: appConfig.openaiImageModel,
    },
  });
  return imageUrls;
}

async function callImagesApi(prompt: string, count: number, options: ImageGenerationOptions, referenceImages: string[] = [], task?: SourceImageTask) {
  return runWithConcurrencyPool("image", () => callImagesApiInPool(prompt, count, options, referenceImages, task));
}

async function callImagesApiInPool(prompt: string, count: number, options: ImageGenerationOptions, referenceImages: string[] = [], task?: SourceImageTask) {
  const startedAt = Date.now();
  const preparedReferences = await prepareReferenceImages(referenceImages, options.size);
  const endpointPath = preparedReferences.files.length ? "images/edits" : "images/generations";
  if (task && isStrictDualReferenceTask(task) && (endpointPath !== "images/edits" || preparedReferences.files.length !== 2 || referenceImages.length !== 2)) {
    await cleanupPreparedReferenceImages(preparedReferences);
    throw new Error(
      `Strict viral image imitation requires exactly 2 prepared reference images through /images/edits; prepared ${preparedReferences.files.length}/${referenceImages.length}.`,
    );
  }
  const sizeConstrainedPrompt = buildImageSizeConstrainedPrompt(prompt, options.size);
  await recordExecutionLog({
    scope: "openai/image",
    action: "Request Images API",
    status: "running",
    message: `Preparing to generate images through ${endpointPath}`,
    details: {
      model: appConfig.openaiImageModel,
      count,
      promptLength: sizeConstrainedPrompt.length,
      endpointPath,
      taskId: task?.id || null,
      taskLabel: task?.label || null,
      referencePolicy: task?.referencePolicy || "best_effort",
      referenceImageCount: preparedReferences.values.length,
      preparedReferenceFileCount: preparedReferences.files.length,
      expectedReferenceImageCount: task && isStrictDualReferenceTask(task) ? 2 : referenceImages.length,
      localReferenceCount: preparedReferences.localCount,
      remoteReferenceCount: preparedReferences.remoteCount,
      encodedReferenceCount: preparedReferences.encodedCount,
      referenceMode: preparedReferences.mode,
      size: options.size,
      quality: options.quality,
    },
  });

  const data = await requestImagesApiWithRetry(sizeConstrainedPrompt, count, startedAt, options, preparedReferences);
  const base64Images = (data.data || []).map((item) => item.b64_json).filter((item): item is string => Boolean(item));
  const remoteUrls = (data.data || []).map((item) => item.url).filter((item): item is string => Boolean(item));
  const imageUrls = [...(await saveBase64Images(base64Images)), ...(await materializeGeneratedImageUrls(remoteUrls))].slice(0, count);
  await recordExecutionLog({
    scope: "openai/image",
    action: "Images API completed",
    status: "success",
    message: `Images API returned ${imageUrls.length} images.`,
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

  for (const referenceImage of referenceImages.slice(0, 4)) {
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

async function prepareReferenceImages(referenceImages: string[], requestedSize: ImageGenerationOptions["size"]): Promise<PreparedReferenceImages> {
  const values: string[] = [];
  const fallbackValues: string[] = [];
  const files: PreparedReferenceImage[] = [];
  let localCount = 0;
  let remoteCount = 0;
  let encodedCount = 0;

  for (const referenceImage of referenceImages.filter(Boolean)) {
    const localFile = await resolveLocalReferenceFilePath(referenceImage);
    if (localFile) {
      const normalizedFile = await normalizeReferenceImageFile(localFile, requestedSize);
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
      const remoteFile = await materializeRemoteReferenceImage(referenceImage, requestedSize).catch(async (error) => {
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

async function resolveLocalReferenceFilePath(value: string) {
  const publicFile = resolvePublicFilePath(value);
  if (publicFile) return publicFile;
  if (!path.isAbsolute(value)) return null;
  await access(value);
  return value;
}

function getImageMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "image/png";
}

async function materializeRemoteReferenceImage(url: string, requestedSize: ImageGenerationOptions["size"]) {
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
    return await normalizeReferenceImageFile(rawFile, requestedSize);
  } finally {
    await rm(rawFile, { force: true }).catch(() => undefined);
  }
}

async function resolveDirectSourceImageUrl(sourceUrl: string) {
  const localFile = resolvePublicFilePath(sourceUrl);
  if (localFile) {
    const hasWebpUrl = isWebpImageReference(sourceUrl);
    const format = await readFile(localFile)
      .then((buffer) => sniffImageFormat(buffer))
      .catch((error) => {
        if (hasWebpUrl) {
          throw new Error(`source WebP image inspection failed: ${compactError(error)}`);
        }
        return undefined;
      });

    if (format?.mimeType !== "image/webp") return sourceUrl;
    return convertSourceImageToJpeg(localFile, sourceUrl, "local");
  }

  if (!/^https?:\/\//i.test(sourceUrl) || !isWebpImageReference(sourceUrl)) return sourceUrl;
  return materializeRemoteSourceImageAsJpeg(sourceUrl);
}

async function materializeRemoteSourceImageAsJpeg(url: string) {
  const response = await fetchWithTimeout(
    url,
    {
      headers: buildMediaRequestHeaders(url),
    },
    remoteReferenceTimeoutMs,
  );
  if (!response.ok) {
    throw new Error(`source WebP image download failed: HTTP ${response.status}`);
  }

  const mimeType = normalizeMimeType(response.headers.get("content-type"), url);
  if (!mimeType.startsWith("image/")) {
    throw new Error(`source WebP URL did not return an image (${mimeType})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) {
    throw new Error("source WebP image is empty");
  }
  if (buffer.length > 12 * 1024 * 1024) {
    throw new Error(`source WebP image is too large (${buffer.length} bytes)`);
  }

  const format = sniffImageFormat(buffer);
  if (format?.mimeType !== "image/webp" && mimeType !== "image/webp") return url;

  const rawFile = await writeReferenceInputBuffer(buffer, format?.mimeType || mimeType);
  try {
    return await convertSourceImageToJpeg(rawFile, url, "remote");
  } finally {
    await rm(rawFile, { force: true }).catch(() => undefined);
  }
}

async function convertSourceImageToJpeg(inputFile: string, sourceUrl: string, sourceKind: "local" | "remote") {
  const startedAt = Date.now();
  const outputDir = path.join(process.cwd(), "public", "generated", "source-images");
  await mkdir(outputDir, { recursive: true });
  const outputFile = path.join(outputDir, `source-${Date.now()}-${randomUUID()}.jpg`);
  const outputUrl = `/generated/source-images/${path.basename(outputFile)}`;

  try {
    await runImageTranscodeToJpeg(inputFile, outputFile);
  } catch (error) {
    await rm(outputFile, { force: true }).catch(() => undefined);
    throw new Error(`source WebP to JPG conversion failed: ${compactError(error)}`);
  }

  await recordExecutionLog({
    scope: "openai/image",
    action: "Source WebP converted to JPG",
    status: "info",
    message: "Direct source-image use was converted from WebP to JPG before being returned.",
    durationMs: Date.now() - startedAt,
    details: {
      sourceKind,
      sourceName: path.basename(sourceUrl.split(/[?#]/)[0] || sourceUrl),
      outputFile: path.basename(outputFile),
    },
  });

  return persistRuntimeMedia({ filePath: outputFile, publicPath: outputUrl, contentType: "image/jpeg" });
}

async function normalizeReferenceImageFile(filePath: string, requestedSize: ImageGenerationOptions["size"]) {
  const startedAt = Date.now();
  const outputDir = path.join(process.cwd(), "public", "generated", "image-inputs");
  await mkdir(outputDir, { recursive: true });

  const outputFile = path.join(outputDir, `reference-${Date.now()}-${randomUUID()}.jpg`);
  const target = parseRequestedPixelSize(requestedSize);
  try {
    await runImageResize(filePath, outputFile, target);
  } catch (error) {
    await rm(outputFile, { force: true }).catch(() => undefined);
    throw new Error(`reference image resize failed: ${compactError(error)}`);
  }

  await recordExecutionLog({
    scope: "openai/image",
    action: "Reference image resized",
    status: "info",
    message: target
      ? `Reference image normalized before model input to requested size ${target.width}x${target.height}.`
      : `Reference image normalized before model input; longest side is capped at ${referenceImageMaxSidePx}px.`,
    durationMs: Date.now() - startedAt,
    details: {
      inputFile: path.basename(filePath),
      outputFile: path.basename(outputFile),
      requestedSize,
      ...(target ? { width: target.width, height: target.height } : { maxSidePx: referenceImageMaxSidePx }),
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

function runImageTranscodeToJpeg(inputFile: string, outputFile: string) {
  return new Promise<void>((resolve, reject) => {
    const child = execFile(
      "ffmpeg",
      ["-y", "-hide_banner", "-loglevel", "error", "-i", inputFile, "-frames:v", "1", "-q:v", "2", outputFile],
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

function runImageResize(inputFile: string, outputFile: string, target?: { width: number; height: number }) {
  return new Promise<void>((resolve, reject) => {
    const filter = target
      ? `scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease,pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2:color=white`
      : `scale=${referenceImageMaxSidePx}:${referenceImageMaxSidePx}:force_original_aspect_ratio=decrease`;
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
        filter,
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

function isWebpImageReference(value: string) {
  const cleanValue = value.split(/[?#]/)[0] || "";
  return /\.webp$/i.test(cleanValue) || /(?:format|fmt|imageMogr2\/format)[=/]webp/i.test(value) || /_webp(?:_|$)/i.test(value);
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
    size: normalizeImageGenerationSize(options?.size),
    quality: normalizeImageQuality(options?.quality),
    taskConcurrency: normalizeTaskConcurrency(options?.taskConcurrency),
  };
}

function normalizeProviderPrompt(prompt: string) {
  return typeof prompt === "string" ? prompt.trim() : "";
}

function buildImageSizeConstrainedPrompt(prompt: string, requestedSize: ImageGenerationOptions["size"]) {
  const target = parseRequestedPixelSize(requestedSize);
  if (!target) return prompt;
  const instruction = [
    `请严格按照用户指定尺寸输出：${target.width}x${target.height} 像素。`,
    `最终画布比例必须匹配 ${target.width}:${target.height}，不要沿用参考图、视频帧或素材图的原始横竖比例。`,
    "不要在画面中加入边框、白边、黑边或留白来模拟尺寸；应直接以该尺寸和比例构图生成。",
  ].join("\n");
  return `${prompt.trim()}\n\n${instruction}`.trim();
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
    const filePath = path.join(generatedDir, fileName);
    await writeFile(filePath, Buffer.from(image, "base64"));
    await recordExecutionLog({
      scope: "openai/image",
      action: "Generated image saved",
      status: "info",
      message: "Generated image saved from provider output without local resizing.",
      details: {
        fileName,
      },
    });
    imageUrls.push(
      await persistRuntimeMedia({
        filePath,
        publicPath: `/generated/${fileName}`,
        contentType: "image/png",
      }),
    );
  }

  return imageUrls;
}

async function materializeGeneratedImageUrls(remoteUrls: string[]) {
  const imageUrls: string[] = [];
  for (const [index, remoteUrl] of remoteUrls.entries()) {
    imageUrls.push(await downloadGeneratedImageUrl(remoteUrl, index));
  }
  return imageUrls;
}

async function downloadGeneratedImageUrl(remoteUrl: string, index: number) {
  const response = await fetchWithTimeout(remoteUrl, {
    headers: buildMediaRequestHeaders(remoteUrl),
  });
  if (!response.ok) {
    throw new Error(`generated image URL download failed: HTTP ${response.status}`);
  }

  const mimeType = normalizeMimeType(response.headers.get("content-type"), remoteUrl);
  if (!mimeType.startsWith("image/")) {
    throw new Error(`generated image URL did not return an image (${mimeType})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) {
    throw new Error("generated image URL returned an empty image");
  }
  if (buffer.length > maxGeneratedImageUrlBytes) {
    throw new Error(`generated image URL returned an oversized image (${buffer.length} bytes)`);
  }

  const generatedDir = path.join(process.cwd(), "public", "generated");
  await mkdir(generatedDir, { recursive: true });
  const fileName = `image-${Date.now()}-${randomUUID()}-${index + 1}.${extensionFromMimeType(mimeType)}`;
  const filePath = path.join(generatedDir, fileName);
  await writeFile(filePath, buffer);
  await recordExecutionLog({
    scope: "openai/image",
    action: "Generated image URL saved",
    status: "info",
    message: "Generated image URL output was saved locally without local resizing.",
    details: {
      fileName,
    },
  });
  return persistRuntimeMedia({
    filePath,
    publicPath: `/generated/${fileName}`,
    contentType: mimeType,
  });
}

function parseRequestedPixelSize(requestedSize: ImageGenerationOptions["size"]) {
  if (requestedSize === "auto") return undefined;
  const match = /^(\d{2,5})x(\d{2,5})$/.exec(requestedSize);
  if (!match) return undefined;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 64 || height < 64 || width > 8192 || height > 8192) return undefined;
  return { width, height };
}
