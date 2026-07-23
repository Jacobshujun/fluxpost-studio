import { execFile } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { compactError, recordExecutionLog } from "./activity-log";
import { isComfyUiKleinConfigured, runComfyUiKleinImageTask } from "./comfyui-klein";
import { appConfig, isOpenaiImageRouteConfigured, openaiImageApiKey, openaiImageRouteConfig, openaiImageUrl, type OpenaiImageApiRoute } from "./config";
import { concurrencyConfig, mapWithConcurrency, runWithConcurrencyPool } from "./concurrency";
import { buildSingleImageTaskPrompt } from "./creation-controls";
import { sniffImageFormat } from "./image-format";
import { convertHeicBufferToJpeg, normalizeHeicFileToJpeg } from "./image-normalization";
import { defaultImageGenerationSize, normalizeImageGenerationSize } from "./image-size-options";
import { buildMediaRequestHeaders } from "./media-request";
import { fetchOpenAiImageSse } from "./openai-image-sse";
import { deleteRuntimeMediaObject, isTosRuntimeMediaConfigured, persistRuntimeMedia, persistTosProbeObject } from "./runtime-media-storage";
import {
  ImageProviderError,
  IMAGE_PROVIDER_CAPABILITIES,
  buildOpenAiJsonGenerationBody,
  parseOpenAiJsonImageResponse,
  type NormalizedImageProviderResponse,
} from "./image-providers/contracts";
import {
  buildToApisGenerationBody,
  formatToApisTaskError,
  getToApisCompletedImageUrls,
  parseRetryAfterMs,
  requireToApisTaskId,
  type ToApisImageTask,
} from "./toapis-image-api";
import type { ImageGenerationOptions, ImageProviderProbeResult, ImageProviderProbeStepResult, SourceImageTask } from "./types";

type ResponsesImageResponse = {
  output?: Array<{
    type?: string;
    result?: string;
  }>;
};

type ImagesApiResponse = NormalizedImageProviderResponse;

type PreparedReferenceImage = {
  filePath: string;
  fileName: string;
  mimeType: string;
  bytes: number;
};

type PreparedReferenceEntry = {
  source: string;
  file?: PreparedReferenceImage;
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
const toApisPollIntervalMs = 5_000;
const toApisPollJitterMaxMs = 750;
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
  entries: PreparedReferenceEntry[];
  toApisUrlsByRoute: Partial<Record<OpenaiImageApiRoute, string[]>>;
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
        try {
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
        } catch (error) {
          taskResultsSummary.push(await recordKeepTaskNeedsReview(task, compactError(error)));
        }
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
          const fallback = await resolveSourceFallback(task, message);
          if (!fallback.ok) {
            taskResultsSummary.push(fallback.taskResult);
            continue;
          }
          const fallbackUrl = fallback.url;
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

export async function runImageProviderProbe(route: OpenaiImageApiRoute): Promise<ImageProviderProbeResult> {
  if (!isOpenaiImageRouteConfigured(route)) throw new Error(`${route === "primary" ? "Primary" : "Backup"} image provider is not configured.`);
  const routeConfig = openaiImageRouteConfig(route);
  const fixture = await writeProbeReferenceFixture();
  let preparedReferences: PreparedReferenceImages | undefined;
  try {
    const generation = await runImageProviderProbeStep(route, routeConfig.profile, "generation", async () => {
      const response = await requestSingleProviderImageForProbe(route, "A simple studio product photograph of a white ceramic cube on a neutral background.", undefined);
      return verifyProbeImageResponse(response);
    });
    preparedReferences = await prepareReferenceImages([fixture], "1024x1024");
    const edit = await runImageProviderProbeStep(route, routeConfig.profile, "edit", async () => {
      const response = await requestSingleProviderImageForProbe(
        route,
        "Create a clean studio variation while preserving the main object.",
        preparedReferences?.files || [],
      );
      return verifyProbeImageResponse(response);
    });
    return {
      ok: generation.ok && edit.ok,
      route,
      profile: routeConfig.profile,
      model: routeConfig.model,
      generation,
      edit,
    };
  } finally {
    if (preparedReferences) await cleanupPreparedReferenceImages(preparedReferences);
    await rm(fixture, { force: true }).catch(() => undefined);
  }
}

async function requestSingleProviderImageForProbe(
  route: OpenaiImageApiRoute,
  prompt: string,
  referenceImages?: PreparedReferenceImage[],
) {
  const options: ImageGenerationOptions = { size: "1024x1024", quality: "low" };
  const startedAt = Date.now();
  const profile = openaiImageRouteConfig(route).profile;
  const preparedReferences = makeProbePreparedReferences(referenceImages || []);
  if (profile === "toapis_async") return requestSingleToApisImagesApiForRoute(route, prompt, startedAt, options, preparedReferences);
  const endpointPath = referenceImages?.length ? "images/edits" : "images/generations";
  if (profile === "openai_json") return requestSingleOpenAiJsonImageForRoute(route, prompt, startedAt, options, preparedReferences, endpointPath);
  return requestSingleStandardImagesApiWithRetryForRoute(route, prompt, startedAt, options, preparedReferences, endpointPath);
}

function makeProbePreparedReferences(files: PreparedReferenceImage[]): PreparedReferenceImages {
  return {
    values: [],
    fallbackValues: [],
    files,
    entries: files.map((file) => ({ source: file.filePath, file })),
    toApisUrlsByRoute: {},
    localCount: files.length,
    remoteCount: 0,
    encodedCount: files.length,
    mode: files.length ? "file" : "none",
  };
}

async function runImageProviderProbeStep(
  _route: OpenaiImageApiRoute,
  _profile: string,
  _mode: "generation" | "edit",
  action: () => Promise<boolean>,
): Promise<ImageProviderProbeStepResult> {
  const startedAt = Date.now();
  try {
    const outputVerified = await action();
    return { ok: outputVerified, durationMs: Date.now() - startedAt, outputVerified, cleanupVerified: true };
  } catch (error) {
    return {
      ok: false,
      durationMs: Date.now() - startedAt,
      outputVerified: false,
      cleanupVerified: !(error instanceof ProbeCleanupError),
      error: sanitizeProbeError(error),
    };
  }
}

async function verifyProbeImageResponse(response: ImagesApiResponse) {
  const first = response.data?.[0];
  if (!first) throw new Error("Provider probe returned no image.");
  if (first.b64_json) {
    const buffer = Buffer.from(first.b64_json, "base64");
    return verifyProbeImageBytes(buffer);
  }
  if (!first.url) throw new Error("Provider probe returned neither image bytes nor a URL.");
  const downloadResponse = await fetchWithTimeout(first.url, { headers: buildMediaRequestHeaders(first.url) }, 30_000);
  if (!downloadResponse.ok) throw new Error(`Provider probe image URL returned HTTP ${downloadResponse.status}.`);
  const buffer = Buffer.from(await downloadResponse.arrayBuffer());
  return verifyProbeImageBytes(buffer);
}

async function verifyProbeImageBytes(buffer: Buffer) {
  const format = sniffImageFormat(buffer);
  if (!format?.modelSupported) throw new Error("Provider probe returned invalid image bytes.");
  if (!appConfig.tosEnabled || !isTosRuntimeMediaConfigured()) return true;

  const persisted = await persistTosProbeObject({
    objectKeySuffix: `image-provider-${Date.now()}-${randomUUID()}${format.extension}`,
    body: buffer,
    contentType: format.mimeType,
  });
  try {
    const response = await fetchWithTimeout(persisted.url, {}, 30_000);
    if (!response.ok) throw new Error(`Provider probe TOS verification returned HTTP ${response.status}.`);
    const persistedBytes = Buffer.from(await response.arrayBuffer());
    if (!persistedBytes.equals(buffer)) throw new Error("Provider probe TOS verification returned different bytes.");
  } finally {
    try {
      await deleteRuntimeMediaObject(persisted.objectKey);
    } catch (error) {
      throw new ProbeCleanupError("Provider probe TOS object cleanup failed.", { cause: error });
    }
  }
  return true;
}

async function writeProbeReferenceFixture() {
  const fixtureDir = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "image-provider-probes");
  await mkdir(fixtureDir, { recursive: true });
  const filePath = path.join(fixtureDir, `probe-${randomUUID()}.png`);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await writeFile(filePath, png);
  return filePath;
}

function sanitizeProbeError(error: unknown) {
  return compactError(error).replace(/https?:\/\/\S+/g, "provider-url").slice(0, 240);
}

class ProbeCleanupError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProbeCleanupError";
  }
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
    try {
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
    } catch (error) {
      return {
        imageUrls: [],
        taskResult: await recordKeepTaskNeedsReview(task, compactError(error)),
      };
    }
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
      const fallback = await resolveSourceFallback(task, message);
      if (!fallback.ok) {
        return { imageUrls: [], taskResult: fallback.taskResult };
      }
      const fallbackUrl = fallback.url;
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
      const fallback = await resolveSourceFallback(task, message);
      if (!fallback.ok) {
        return { imageUrls: [], taskResult: fallback.taskResult };
      }
      const fallbackUrl = fallback.url;
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
  if (appConfig.openaiImageEndpoint !== "images") return "responses";
  return openaiImageRouteConfig(resolveActiveStandardImagesApiRoute()).profile === "toapis_async" ? "images/generations" : "images/edits";
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

async function recordKeepTaskNeedsReview(task: SourceImageTask, message: string) {
  const result = makeTaskGenerationResult(task, "needs_review", {
    referenceImageCount: 1,
    fallbackUsed: false,
    message,
  });
  await recordExecutionLog({
    scope: "openai/image",
    action: "Keep source image needs review",
    status: "error",
    message: `${task.label} was not saved because the source image could not be normalized into browser-readable media: ${message}`,
    details: {
      taskId: task.id,
      taskLabel: task.label,
      sourceUrl: task.url,
      sourceKind: task.kind,
      fallbackUsed: false,
    },
  });
  return result;
}

async function resolveSourceFallback(task: SourceImageTask, providerMessage: string) {
  try {
    return { ok: true, url: await resolveDirectSourceImageUrl(task.url) } as const;
  } catch (error) {
    const sourceMessage = compactError(error);
    return {
      ok: false,
      taskResult: await recordKeepTaskNeedsReview(
        task,
        `Image provider fallback was required (${providerMessage}), but the source image was also unusable (${sourceMessage}).`,
      ),
    } as const;
  }
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
  const initialRoute = resolveActiveStandardImagesApiRoute();
  const initialProfile = openaiImageRouteConfig(initialRoute).profile;
  const endpointPath = initialProfile === "toapis_async" ? "images/generations" : preparedReferences.files.length ? "images/edits" : "images/generations";
  const strictReferencesInvalid =
    referenceImages.length !== 2 || preparedReferences.entries.length !== 2 || (initialProfile !== "toapis_async" && preparedReferences.files.length !== 2);
  if (task && isStrictDualReferenceTask(task) && strictReferencesInvalid) {
    await cleanupPreparedReferenceImages(preparedReferences);
    throw new Error(
      `Strict viral image imitation requires exactly 2 prepared reference images; prepared ${preparedReferences.entries.length}/${referenceImages.length}.`,
    );
  }
  await recordExecutionLog({
    scope: "openai/image",
    action: "Request Images API",
    status: "running",
    message: `Preparing to generate images through ${endpointPath}`,
    details: {
      model: openaiImageRouteConfig(initialRoute).model,
      count,
      promptLength: prompt.length,
      endpointPath,
      profile: initialProfile,
      transport: IMAGE_PROVIDER_CAPABILITIES[initialProfile].transport,
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

  const data = await requestImagesApiWithRetry(prompt, count, startedAt, options, preparedReferences);
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
      model: openaiImageRouteConfig(activeStandardImagesApiRoute).model,
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
  const routeConfig = openaiImageRouteConfig(route);
  const profile = routeConfig.profile;
  if (profile === "toapis_async") {
    return requestSingleToApisImagesApiForRoute(route, prompt, startedAt, options, referenceImages);
  }
  if (profile === "openai_json") {
    return requestSingleOpenAiJsonImageForRoute(route, prompt, startedAt, options, referenceImages, endpointPath);
  }

  const sizeConstrainedPrompt = buildImageSizeConstrainedPrompt(prompt, options.size);
  let lastError = "";
  let lastProviderError: ImageProviderError | undefined;
  let sendQuality = Boolean(options.quality);
  let sendInputFidelity = endpointPath === "images/edits";
  const deadline = startedAt + imageRequestTimeoutMs;

  for (let attempt = 1; attempt <= maxImageAttempts; attempt += 1) {
    let responseResult: Awaited<ReturnType<typeof fetchOpenAiImageSse>>;
    try {
      responseResult = await fetchOpenAiImageSse(
        openaiImageUrl(endpointPath, route),
        await buildStandardImagesApiRequest(route, sizeConstrainedPrompt, options, referenceImages.files, sendQuality, sendInputFidelity),
        getRemainingTimeoutMs(deadline),
      );
    } catch (error) {
      lastProviderError = toImageProviderTransportError(error);
      lastError = lastProviderError.message;
      const isTimeout = /request timed out|timed out after|time-?out|timeout|abort/i.test(lastError);
      const shouldRetryTransport = attempt < maxImageAttempts && hasRetryWindow(deadline) && isStandardImagesApiFailoverError(error);
      await recordExecutionLog({
        scope: "openai/image",
        action: shouldRetryTransport ? (isTimeout ? "Images API request timeout retry" : "Images API SSE retry queued") : isTimeout ? "Images API request timed out" : "Images API SSE failed",
        status: shouldRetryTransport ? "info" : "error",
        message: shouldRetryTransport ? `${lastError}; retrying ${attempt + 1}/${maxImageAttempts}.` : lastError,
        durationMs: Date.now() - startedAt,
        details: {
          status: 0,
          model: routeConfig.model,
          route,
          endpointPath,
          transport: "sse",
          attempt,
          size: options.size,
          quality: sendQuality ? options.quality : "omitted",
          referenceMode: referenceImages.mode,
        },
      });
      if (!shouldRetryTransport) throw lastProviderError;
      await sleepWithinDeadline(getImageRetryDelayMs(attempt), deadline);
      continue;
    }

    const { response } = responseResult;
    if (response.ok && responseResult.stream) {
      await recordExecutionLog({
        scope: "openai/image",
        action: "Images API SSE completed",
        status: "success",
        message: "OpenAI-compatible image SSE completed with a final image.",
        durationMs: Date.now() - startedAt,
        details: {
          model: routeConfig.model,
          route,
          endpointPath,
          transport: "sse",
          attempt,
          ...responseResult.stream.stats,
        },
      });
      return responseResult.stream.response;
    }

    const body = responseResult.body || "";

    lastProviderError = toImageProviderHttpError("OpenAI SSE image request", response.status, body);
    lastError = lastProviderError.message;
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
        model: routeConfig.model,
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
    if (uploadRejected) throw lastProviderError;
    if (qualityRejected) {
      sendQuality = false;
      continue;
    }
    if (!shouldRetry) throw lastProviderError;
    await sleepWithinDeadline(getImageRetryDelayMs(attempt), deadline);
  }

  throw lastProviderError || new ImageProviderError(lastError || "OpenAI image request failed.", {
    category: "provider",
    retryable: false,
    failoverAllowed: true,
  });
}

async function requestSingleOpenAiJsonImageForRoute(
  route: OpenaiImageApiRoute,
  prompt: string,
  startedAt: number,
  options: ImageGenerationOptions,
  referenceImages: PreparedReferenceImages,
  endpointPath: "images/edits" | "images/generations",
): Promise<ImagesApiResponse> {
  const routeConfig = openaiImageRouteConfig(route);
  const deadline = startedAt + imageRequestTimeoutMs;
  let sendQuality = Boolean(options.quality);
  let lastError: ImageProviderError | undefined;

  for (let attempt = 1; attempt <= maxImageAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        openaiImageUrl(endpointPath, route),
        await buildOpenAiJsonRequest(route, prompt, options, referenceImages.files, sendQuality),
        getRemainingTimeoutMs(deadline),
      );
    } catch (error) {
      const providerError = toImageProviderTransportError(error);
      lastError = providerError;
      const shouldRetry = providerError.retryable && attempt < maxImageAttempts && hasRetryWindow(deadline);
      if (!shouldRetry) throw providerError;
      await sleepWithinDeadline(getImageRetryDelayMs(attempt), deadline);
      continue;
    }

    const body = await response.text();
    if (response.ok) {
      const parsed = parseOpenAiJsonImageResponse(body, response.headers.get("content-type") || "");
      await recordExecutionLog({
        scope: "openai/image",
        action: "Images API JSON completed",
        status: "success",
        message: "OpenAI-compatible JSON image request completed with a final image.",
        durationMs: Date.now() - startedAt,
        details: {
          model: routeConfig.model,
          route,
          endpointPath,
          profile: routeConfig.profile,
          attempt,
          size: options.size,
          quality: sendQuality ? options.quality : "omitted",
        },
      });
      return parsed;
    }

    const qualityRejected = sendQuality && isUnsupportedQualityError(response.status, body);
    const providerError = toImageProviderHttpError("OpenAI JSON image request", response.status, body);
    lastError = providerError;
    const shouldRetry = providerError.retryable && attempt < maxImageAttempts && hasRetryWindow(deadline);
    await recordExecutionLog({
      scope: "openai/image",
      action: qualityRejected ? "Images JSON quality parameter fallback" : shouldRetry ? "Images JSON retry queued" : "Images JSON failed",
      status: qualityRejected || shouldRetry ? "info" : "error",
      message: qualityRejected
        ? `OpenAI JSON image request rejected quality; retrying without it.`
        : shouldRetry
          ? `${providerError.message}; retrying ${attempt + 1}/${maxImageAttempts}.`
          : providerError.message,
      durationMs: Date.now() - startedAt,
      details: {
        status: response.status,
        model: routeConfig.model,
        route,
        endpointPath,
        profile: routeConfig.profile,
        attempt,
        size: options.size,
        quality: sendQuality ? options.quality : "omitted",
      },
    });
    if (qualityRejected) {
      sendQuality = false;
      continue;
    }
    if (!shouldRetry) throw providerError;
    await sleepWithinDeadline(getImageRetryDelayMs(attempt), deadline);
  }

  throw lastError || new ImageProviderError("OpenAI JSON image request failed.", {
    category: "provider",
    retryable: false,
    failoverAllowed: true,
  });
}

async function buildOpenAiJsonRequest(
  route: OpenaiImageApiRoute,
  prompt: string,
  options: ImageGenerationOptions,
  referenceImages: PreparedReferenceImage[],
  sendQuality: boolean,
): Promise<RequestInit> {
  const routeConfig = openaiImageRouteConfig(route);
  const fields = buildOpenAiJsonGenerationBody({
    model: routeConfig.model,
    prompt,
    size: options.size,
    quality: sendQuality ? options.quality : undefined,
  });
  if (!referenceImages.length) {
    return {
      method: "POST",
      headers: openaiImageHeaders(true, route),
      body: JSON.stringify(fields),
    };
  }

  const form = new FormData();
  form.append("model", fields.model);
  form.append("prompt", fields.prompt);
  form.append("n", String(fields.n));
  form.append("size", fields.size);
  if (fields.quality) form.append("quality", fields.quality);
  for (const referenceImage of referenceImages.slice(0, 4)) {
    const file = await readFile(referenceImage.filePath);
    form.append("image[]", new Blob([new Uint8Array(file)], { type: referenceImage.mimeType }), referenceImage.fileName);
  }
  return {
    method: "POST",
    headers: openaiImageHeaders(false, route),
    body: form,
  };
}

async function requestSingleToApisImagesApiForRoute(
  route: OpenaiImageApiRoute,
  prompt: string,
  startedAt: number,
  options: ImageGenerationOptions,
  referenceImages: PreparedReferenceImages,
): Promise<ImagesApiResponse> {
  const routeConfig = openaiImageRouteConfig(route);
  const deadline = startedAt + imageRequestTimeoutMs;
  const referenceUrls = await prepareToApisReferenceUrls(route, referenceImages, deadline);
  const requestBody = buildToApisGenerationBody({
    model: routeConfig.model,
    prompt,
    requestedSize: options.size,
    referenceImages: referenceUrls,
  });
  let task: ToApisImageTask | undefined;
  let lastError = "";
  let lastProviderError: ImageProviderError | undefined;

  for (let attempt = 1; attempt <= maxImageAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        openaiImageUrl("images/generations", route),
        {
          method: "POST",
          headers: openaiImageHeaders(true, route),
          body: JSON.stringify(requestBody),
        },
        getRemainingTimeoutMs(deadline),
      );
    } catch (error) {
      lastProviderError = toImageProviderTransportError(error);
      lastError = lastProviderError.message;
      const shouldRetry = lastProviderError.retryable && attempt < maxImageAttempts && hasRetryWindow(deadline);
      if (!shouldRetry) throw lastProviderError;
      await sleepWithinDeadline(getImageRetryDelayMs(attempt), deadline);
      continue;
    }
    const body = await response.text();
    if (response.ok) {
      try {
        task = parseJsonResponse<ToApisImageTask>(body, response, "ToAPIs image submission");
      } catch (error) {
        throw new ImageProviderError("ToAPIs image submission returned an invalid response.", {
          category: "provider",
          retryable: false,
          failoverAllowed: true,
          cause: error,
        });
      }
      break;
    }

    lastProviderError = toImageProviderHttpError("ToAPIs image submission", response.status, body);
    lastError = lastProviderError.message;
    const shouldRetry = lastProviderError.retryable && attempt < maxImageAttempts && hasRetryWindow(deadline);
    await recordExecutionLog({
      scope: "openai/image",
      action: shouldRetry ? "ToAPIs image submission retry queued" : "ToAPIs image submission failed",
      status: shouldRetry ? "info" : "error",
      message: shouldRetry ? compactError(`${lastError}; retrying ${attempt + 1}/${maxImageAttempts}.`) : compactError(lastError),
      durationMs: Date.now() - startedAt,
      details: {
        status: response.status,
        model: routeConfig.model,
        route,
        attempt,
        size: requestBody.size,
        resolution: requestBody.resolution,
        referenceImageCount: referenceUrls.length,
      },
    });
    if (!shouldRetry) throw lastProviderError;
    const retryDelayMs = parseRetryAfterMs(response.headers.get("retry-after")) || getImageRetryDelayMs(attempt);
    await sleepWithinDeadline(retryDelayMs, deadline);
  }

  if (!task) {
    throw lastProviderError || new ImageProviderError(lastError || "ToAPIs image submission failed without a response.", {
      category: "provider",
      retryable: false,
      failoverAllowed: true,
    });
  }
  let taskId: string;
  try {
    taskId = requireToApisTaskId(task);
  } catch (error) {
    throw new ImageProviderError("ToAPIs image submission did not include a task id.", {
      category: "provider",
      retryable: false,
      failoverAllowed: true,
      cause: error,
    });
  }
  await recordExecutionLog({
    scope: "openai/image",
    action: "ToAPIs image task submitted",
    status: "running",
    message: "ToAPIs accepted an asynchronous image task.",
    durationMs: Date.now() - startedAt,
    details: {
      taskId,
      route,
      model: routeConfig.model,
      size: requestBody.size,
      resolution: requestBody.resolution,
      referenceImageCount: referenceUrls.length,
    },
  });

  for (let pollAttempt = 0; ; pollAttempt += 1) {
    if (task.status === "completed") {
      const urls = getToApisCompletedImageUrls(task);
      if (!urls.length) throw toAcceptedImageProviderError("ToAPIs image task completed without a result URL.");
      return { data: urls.map((url) => ({ url })) };
    }
    if (task.status === "failed") throw toAcceptedImageProviderError(`ToAPIs image task failed: ${formatToApisTaskError(task)}`);
    if (task.status && !["pending", "queued", "in_progress"].includes(task.status)) {
      throw toAcceptedImageProviderError(`ToAPIs image task returned unsupported status: ${task.status}`);
    }
    if (!hasRetryWindow(deadline)) throw toAcceptedImageProviderError(`ToAPIs image task timed out after ${Math.round(imageRequestTimeoutMs / 1000)}s.`, "timeout");

    await sleepWithinDeadline(getToApisPollDelayMs(taskId, pollAttempt), deadline);
    let response: Response;
    try {
      response = await fetchWithTimeout(
        openaiImageUrl(`images/generations/${encodeURIComponent(taskId)}`, route),
        { headers: openaiImageHeaders(false, route) },
        getRemainingTimeoutMs(deadline),
      );
    } catch (error) {
      await recordExecutionLog({
        scope: "openai/image",
        action: "ToAPIs image status request retry queued",
        status: "info",
        message: compactError(error),
        durationMs: Date.now() - startedAt,
        details: { taskId, route },
      });
      continue;
    }
    const body = await response.text();

    if (response.status === 429 || (response.status >= 500 && response.status <= 504)) {
      const retryDelayMs = parseRetryAfterMs(response.headers.get("retry-after")) || Math.min(toApisPollIntervalMs * 2 ** Math.min(pollAttempt, 3), 60_000);
      await recordExecutionLog({
        scope: "openai/image",
        action: "ToAPIs image status retry queued",
        status: "info",
        message: `ToAPIs status query returned HTTP ${response.status}; respecting provider retry guidance.`,
        durationMs: Date.now() - startedAt,
        details: { taskId, route, status: response.status, retryDelayMs },
      });
      await sleepWithinDeadline(retryDelayMs, deadline);
      continue;
    }
    if (!response.ok) throw toAcceptedImageProviderError(`ToAPIs image status failed with HTTP ${response.status}.`);
    try {
      task = parseJsonResponse<ToApisImageTask>(body, response, "ToAPIs image status");
    } catch (error) {
      throw new ImageProviderError("ToAPIs image status returned an invalid response.", {
        category: "provider",
        retryable: false,
        failoverAllowed: false,
        taskAccepted: true,
        cause: error,
      });
    }
  }
}

async function prepareToApisReferenceUrls(route: OpenaiImageApiRoute, referenceImages: PreparedReferenceImages, deadline: number) {
  const cached = referenceImages.toApisUrlsByRoute[route];
  if (cached) return cached;

  const urls: string[] = [];
  for (const entry of referenceImages.entries) {
    if (/^https?:\/\//i.test(entry.source)) {
      urls.push(entry.source);
      continue;
    }
    if (!entry.file) throw new Error("ToAPIs reference images must be public HTTP URLs or readable local image files.");
    urls.push(await uploadToApisReferenceImage(route, entry.file, deadline));
  }
  referenceImages.toApisUrlsByRoute[route] = urls;
  return urls;
}

async function uploadToApisReferenceImage(route: OpenaiImageApiRoute, image: PreparedReferenceImage, deadline: number) {
  if (image.bytes > 10 * 1024 * 1024) throw new Error(`ToAPIs reference upload exceeds the documented 10MB limit (${image.bytes} bytes).`);
  const form = new FormData();
  const file = await readFile(image.filePath);
  form.append("file", new Blob([new Uint8Array(file)], { type: image.mimeType }), image.fileName);
  form.append("purpose", "generation");
  const response = await fetchWithTimeout(
    openaiImageUrl("uploads/images", route),
    { method: "POST", headers: openaiImageHeaders(false, route), body: form },
    getRemainingTimeoutMs(deadline),
  );
  const body = await response.text();
  if (!response.ok) throw toImageProviderHttpError("ToAPIs image upload", response.status, body);
  const payload = parseJsonResponse<{ success?: boolean; message?: string; data?: { url?: string } }>(body, response, "ToAPIs image upload");
  if (payload.success !== true || !payload.data?.url) {
    const message = payload.message || "response did not include a public URL";
    const inputRejected = /image upload failed|check the image|invalid image|unsupported image|file (?:type|format|size)/i.test(message);
    throw new ImageProviderError(`ToAPIs image upload failed: ${message}`, {
      category: inputRejected ? "input" : "capability",
      retryable: false,
      failoverAllowed: !inputRejected,
    });
  }
  await recordExecutionLog({
    scope: "openai/image",
    action: "ToAPIs reference image uploaded",
    status: "success",
    message: "A local reference image was uploaded for ToAPIs generation.",
    details: { route, fileName: image.fileName, bytes: image.bytes },
  });
  return payload.data.url;
}

function getToApisPollDelayMs(taskId: string, pollAttempt: number) {
  let hash = pollAttempt + 1;
  for (const char of taskId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return toApisPollIntervalMs + (hash % (toApisPollJitterMaxMs + 1));
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
      headers: openaiImageHeaders(true, route, true),
      body: JSON.stringify(buildStandardImagesGenerationBody(openaiImageRouteConfig(route).model, prompt, options, sendQuality)),
    };
  }

  const form = new FormData();
  form.append("model", openaiImageRouteConfig(route).model);
  form.append("prompt", prompt);
  form.append("n", "1");
  form.append("size", options.size);
  form.append("output_format", "png");
  form.append("response_format", "b64_json");
  form.append("stream", "true");
  if (sendQuality) form.append("quality", options.quality);
  if (sendInputFidelity) form.append("input_fidelity", "high");

  for (const referenceImage of referenceImages.slice(0, 4)) {
    const file = await readFile(referenceImage.filePath);
    form.append("image", new Blob([new Uint8Array(file)], { type: referenceImage.mimeType }), referenceImage.fileName);
  }

  return {
    method: "POST",
    headers: openaiImageHeaders(false, route, true),
    body: form,
  };
}

function buildStandardImagesGenerationBody(model: string, prompt: string, options: ImageGenerationOptions, sendQuality: boolean) {
  return {
    model,
    prompt,
    n: 1,
    size: options.size,
    ...(sendQuality ? { quality: options.quality } : {}),
    output_format: "png",
    response_format: "b64_json",
    stream: true,
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

function toImageProviderTransportError(error: unknown) {
  if (error instanceof ImageProviderError) return error;
  const message = compactError(error);
  if (/Images API (?:returned non-SSE|SSE|stream)/i.test(message)) {
    return new ImageProviderError("Image provider returned an incompatible streaming response.", {
      category: "capability",
      retryable: false,
      failoverAllowed: true,
      cause: error,
    });
  }
  const timedOut = /timed out|time-?out|timeout|abort/i.test(message);
  return new ImageProviderError(timedOut ? "Image provider request timed out." : "Image provider network request failed.", {
    category: timedOut ? "timeout" : "network",
    retryable: true,
    failoverAllowed: true,
    cause: error,
  });
}

function toImageProviderHttpError(label: string, status: number, body: string) {
  const contentRejected = /cannot fulfill this request|content policy|safety|moderation/i.test(body);
  const inputRejected = /image upload failed|check the image|invalid image|failed to download|download image/i.test(body);
  const capabilityRejected = status === 404 || isImageProviderCapabilityError(body);
  const authRejected = status === 401 || status === 403;
  const retryable = !contentRejected && !inputRejected && !capabilityRejected && retryableImageStatuses.has(status);
  const category = contentRejected
    ? "content"
    : inputRejected
      ? "input"
      : authRejected
        ? "auth"
        : capabilityRejected
          ? "capability"
          : status === 400
            ? "input"
          : status === 408
            ? "timeout"
            : "provider";
  return new ImageProviderError(`${label} failed with HTTP ${status}.`, {
    category,
    retryable,
    failoverAllowed: !contentRejected && !inputRejected && category !== "input" && (authRejected || capabilityRejected || retryableImageStatuses.has(status)),
  });
}

function toAcceptedImageProviderError(message: string, category: "provider" | "timeout" = "provider") {
  return new ImageProviderError(message, {
    category,
    retryable: false,
    failoverAllowed: false,
    taskAccepted: true,
  });
}

function isRetryableImageError(status: number, body: string) {
  if (/cannot fulfill this request/i.test(body)) return false;
  if (isImageProviderCapabilityError(body)) return false;
  if (retryableImageStatuses.has(status)) return true;
  return /upstream_error|excessive system load|overloaded|temporarily unavailable|timeout|rate limit/i.test(body);
}

function isUnsupportedQualityError(status: number, body: string) {
  return status === 400 && /quality/i.test(body) && /unknown parameter|unsupported|invalid.*parameter|unrecognized/i.test(body);
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
  return isOpenaiImageRouteConfigured(route);
}

function isStandardImagesApiFailoverError(error: unknown) {
  if (error instanceof ImageProviderError) return error.failoverAllowed && !error.taskAccepted;
  const message = compactError(error);
  if (/ToAPIs image (?:task|status)/i.test(message)) return false;
  if (/cannot fulfill this request|content policy|safety|moderation|image upload failed|check the image|invalid image|failed to download|download image/i.test(message)) {
    return false;
  }
  return (
    /(?:OpenAI image request failed:\s*|ToAPIs image submission failed:\s*HTTP\s*)(?:401|403|404|408|409|425|429|50[0234])\b/i.test(message) ||
    /Images API (?:returned non-SSE|SSE|stream)/i.test(message) ||
    /request timed out|timed out after|time-?out|timeout|abort|fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT|ECONNREFUSED/i.test(message) ||
    /upstream_error|excessive system load|overloaded|temporarily unavailable|rate limit|Gateway Time-?out|Bad Gateway|Service Unavailable/i.test(message) ||
    isImageProviderCapabilityError(message)
  );
}

function openaiImageHeaders(json = true, route: OpenaiImageApiRoute = "primary", stream = false) {
  return {
    Authorization: `Bearer ${openaiImageApiKey(route)}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(stream ? { Accept: "text/event-stream" } : {}),
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
  const entries: PreparedReferenceEntry[] = [];
  let localCount = 0;
  let remoteCount = 0;
  let encodedCount = 0;

  for (const referenceImage of referenceImages.filter(Boolean)) {
    const localFile = await resolveLocalReferenceFilePath(referenceImage);
    if (localFile) {
      const normalizedFile = await normalizeReferenceImageFile(localFile, requestedSize);
      const file = await readFile(normalizedFile);
      const base64 = file.toString("base64");
      const preparedFile = {
        filePath: normalizedFile,
        fileName: path.basename(normalizedFile),
        mimeType: getImageMimeType(normalizedFile),
        bytes: file.length,
      };
      values.push(base64);
      fallbackValues.push(`data:${getImageMimeType(normalizedFile)};base64,${base64}`);
      files.push(preparedFile);
      entries.push({ source: referenceImage, file: preparedFile });
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
        const preparedFile = {
          filePath: remoteFile,
          fileName: path.basename(remoteFile),
          mimeType: getImageMimeType(remoteFile),
          bytes: file.length,
        };
        values.push(base64);
        fallbackValues.push(`data:${getImageMimeType(remoteFile)};base64,${base64}`);
        files.push(preparedFile);
        entries.push({ source: referenceImage, file: preparedFile });
        remoteCount += 1;
        encodedCount += 1;
        continue;
      }
    }

    values.push(referenceImage);
    entries.push({ source: referenceImage });
    remoteCount += /^https?:\/\//i.test(referenceImage) ? 1 : 0;
  }

  return {
    values,
    fallbackValues,
    files,
    entries,
    toApisUrlsByRoute: {},
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
    const format = await readFile(localFile).then((buffer) => sniffImageFormat(buffer));
    if (format?.mimeType === "image/heic") {
      await normalizeHeicFileToJpeg(localFile);
      return sourceUrl;
    }
    if (!format?.browserSupported) {
      throw new Error(`source image is not browser-readable (${format?.mimeType || "unknown format"})`);
    }
    if (format.mimeType === "image/webp") return convertSourceImageToJpeg(localFile, sourceUrl, "local");
    return sourceUrl;
  }

  if (!/^https?:\/\//i.test(sourceUrl)) throw new Error("source image URL is not supported");
  return materializeRemoteSourceImage(sourceUrl);
}

async function materializeRemoteSourceImage(url: string) {
  const response = await fetchWithTimeout(
    url,
    {
      headers: buildMediaRequestHeaders(url),
    },
    remoteReferenceTimeoutMs,
  );
  if (!response.ok) {
    throw new Error(`source image download failed: HTTP ${response.status}`);
  }

  const mimeType = normalizeMimeType(response.headers.get("content-type"), url);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > 12 * 1024 * 1024) {
    throw new Error(`source image is too large (${contentLength} bytes)`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) {
    throw new Error("source image is empty");
  }
  if (buffer.length > 12 * 1024 * 1024) {
    throw new Error(`source image is too large (${buffer.length} bytes)`);
  }

  const format = sniffImageFormat(buffer);
  if (!format && !mimeType.startsWith("image/")) {
    throw new Error(`source image URL did not return recognizable image bytes (${mimeType})`);
  }
  if (format?.mimeType === "image/heic") {
    return persistConvertedSourceJpeg(await convertHeicBufferToJpeg(buffer), url, "HEIC");
  }
  if (!format?.browserSupported) {
    throw new Error(`source image is not browser-readable (${format?.mimeType || mimeType || "unknown format"})`);
  }
  if (format.mimeType !== "image/webp" && mimeType !== "image/webp") {
    return persistRemoteSourceImage(buffer, url, format.mimeType, format.extension);
  }

  const rawFile = await writeReferenceInputBuffer(buffer, format?.mimeType || mimeType);
  try {
    return await convertSourceImageToJpeg(rawFile, url, "remote");
  } finally {
    await rm(rawFile, { force: true }).catch(() => undefined);
  }
}

async function persistConvertedSourceJpeg(buffer: Buffer, sourceUrl: string, sourceFormat: string) {
  const startedAt = Date.now();
  const outputDir = path.join(process.cwd(), "public", "generated", "source-images");
  await mkdir(outputDir, { recursive: true });
  const outputFile = path.join(outputDir, `source-${Date.now()}-${randomUUID()}.jpg`);
  const outputUrl = `/generated/source-images/${path.basename(outputFile)}`;
  await writeFile(outputFile, buffer);

  await recordExecutionLog({
    scope: "openai/image",
    action: "Source image converted to JPG",
    status: "info",
    message: `Direct source-image use was converted from ${sourceFormat} to JPG before being returned.`,
    durationMs: Date.now() - startedAt,
    details: {
      sourceFormat,
      sourceName: path.basename(sourceUrl.split(/[?#]/)[0] || sourceUrl),
      outputFile: path.basename(outputFile),
    },
  });

  return persistRuntimeMedia({ filePath: outputFile, publicPath: outputUrl, contentType: "image/jpeg" });
}

async function persistRemoteSourceImage(buffer: Buffer, sourceUrl: string, contentType: string, extension: string) {
  const outputDir = path.join(process.cwd(), "public", "generated", "source-images");
  await mkdir(outputDir, { recursive: true });
  const safeExtension = extension.startsWith(".") ? extension : `.${extension}`;
  const outputFile = path.join(outputDir, `source-${Date.now()}-${randomUUID()}${safeExtension}`);
  const outputUrl = `/generated/source-images/${path.basename(outputFile)}`;
  await writeFile(outputFile, buffer);
  await recordExecutionLog({
    scope: "openai/image",
    action: "Remote source image persisted",
    status: "info",
    message: "Direct remote source-image use was persisted before being returned.",
    details: {
      contentType,
      sourceName: path.basename(sourceUrl.split(/[?#]/)[0] || sourceUrl),
      outputFile: path.basename(outputFile),
    },
  });
  return persistRuntimeMedia({ filePath: outputFile, publicPath: outputUrl, contentType });
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
  if (error instanceof ImageProviderError && (error.taskAccepted || error.category === "capability")) return false;
  if (/ToAPIs image/i.test(compactError(error))) return false;
  if (isImageProviderCapabilityError(error)) return false;
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

function isImageProviderCapabilityError(error: unknown) {
  return /model_not_found|no available channel/i.test(compactError(error));
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
