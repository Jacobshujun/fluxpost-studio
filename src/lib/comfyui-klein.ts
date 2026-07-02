import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { compactError, recordExecutionLog } from "./activity-log";
import { appConfig } from "./config";
import { runWithConcurrencyPool } from "./concurrency";
import { saveImageGenerationQueueJobToDb } from "./database";
import { buildMediaRequestHeaders } from "./media-request";
import type { ImageGenerationQueueJob, SourceImageTask } from "./types";

type ComfyPrompt = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

type ComfyUiWorkflowNode = {
  id: number | string;
  type: string;
  inputs?: Array<{
    name: string;
    link?: number | null;
  }>;
  widgets_values?: unknown[];
};

type ComfyUiWorkflow = {
  nodes?: ComfyUiWorkflowNode[];
  links?: Array<[number, number | string, number, number | string, number, string]>;
  extra?: {
    ue_links?: Array<{
      downstream: number | string;
      downstream_slot: number;
      upstream: number | string;
      upstream_slot: number;
    }>;
  };
};

type ComfyObjectInfo = Record<
  string,
  {
    input?: {
      required?: Record<string, unknown>;
      optional?: Record<string, unknown>;
    };
  }
>;

const outputMetadataStripTimeoutMs = 60_000;

type ComfyUploadedImage = {
  name?: string;
  subfolder?: string;
  type?: string;
};

type ComfyQueuedPrompt = {
  prompt_id?: string;
  node_errors?: Record<string, unknown>;
};

type ComfyOutputImage = {
  filename?: string;
  subfolder?: string;
  type?: string;
};

type ComfyHistoryEntry = {
  status?: {
    completed?: boolean;
    status_str?: string;
    messages?: unknown[];
  };
  outputs?: Record<string, { images?: ComfyOutputImage[] }>;
};

type ComfyHistoryResponse = Record<string, ComfyHistoryEntry>;

type RunComfyUiKleinImageTaskOptions = {
  task: SourceImageTask;
  prompt: string;
};

const comfyUiObjectInfoCache: {
  promise?: Promise<ComfyObjectInfo>;
} = {};

export function isComfyUiKleinConfigured() {
  return Boolean(appConfig.comfyUiKleinEnabled && hasComfyUiKleinWorkflow());
}

export async function runComfyUiKleinImageTask(options: RunComfyUiKleinImageTaskOptions) {
  const job = await createKleinQueueJob(options);
  await saveImageGenerationQueueJobToDb(job);
  await recordExecutionLog({
    scope: "comfyui/klein",
    action: "ComfyUI Klein image queued",
    status: "info",
    message: `${options.task.label} queued for local ComfyUI Klein processing.`,
    details: {
      jobId: job.id,
      taskId: options.task.id,
      strategyKey: options.task.strategyKey || null,
      referenceImage: options.task.url,
    },
  });

  return runWithConcurrencyPool("localImage", async () => {
    const runningJob = await saveImageGenerationQueueJobToDb({
      ...job,
      status: "running",
      attempts: job.attempts + 1,
      lockedBy: `local-image-${process.pid}`,
      lockedUntil: new Date(Date.now() + appConfig.comfyUiKleinTimeoutMs + 30_000).toISOString(),
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    try {
      const outputUrls = await executeComfyUiKleinJob(runningJob, options);
      await saveImageGenerationQueueJobToDb({
        ...runningJob,
        status: "completed",
        outputUrls,
        lockedBy: undefined,
        lockedUntil: undefined,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return outputUrls;
    } catch (error) {
      const message = compactError(error);
      await saveImageGenerationQueueJobToDb({
        ...runningJob,
        status: "failed",
        lockedBy: undefined,
        lockedUntil: undefined,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        error: message,
      });
      throw error;
    }
  });
}

async function executeComfyUiKleinJob(job: ImageGenerationQueueJob, options: RunComfyUiKleinImageTaskOptions) {
  const startedAt = Date.now();
  await recordExecutionLog({
    scope: "comfyui/klein",
    action: "ComfyUI Klein image started",
    status: "running",
    message: `Local Klein workflow is processing ${options.task.label}.`,
    details: {
      jobId: job.id,
      baseUrl: appConfig.comfyUiBaseUrl,
      taskId: options.task.id,
      strategyKey: options.task.strategyKey || null,
    },
  });

  const uploaded = await uploadReferenceImage(options.task.url);
  const prompt = await buildKleinPrompt(options.prompt, uploaded);
  const promptId = await queueComfyPrompt(prompt);
  const outputImages = await waitForComfyOutput(promptId);
  const outputUrls = await saveComfyOutputImages(outputImages);

  await recordExecutionLog({
    scope: "comfyui/klein",
    action: "ComfyUI Klein image completed",
    status: "success",
    message: `Local Klein workflow returned ${outputUrls.length} image(s).`,
    durationMs: Date.now() - startedAt,
    details: {
      jobId: job.id,
      promptId,
      outputCount: outputUrls.length,
      taskId: options.task.id,
    },
  });

  return outputUrls;
}

async function createKleinQueueJob(options: RunComfyUiKleinImageTaskOptions): Promise<ImageGenerationQueueJob> {
  const now = new Date().toISOString();
  return {
    id: `image-klein-${Date.now()}-${randomUUID().slice(0, 8)}`,
    provider: "comfyui_klein",
    status: "queued",
    priority: 0,
    attempts: 0,
    maxAttempts: 1,
    runAfter: now,
    createdAt: now,
    updatedAt: now,
    taskId: options.task.id,
    taskLabel: options.task.label,
    strategyKey: options.task.strategyKey,
    prompt: options.prompt,
    referenceImage: options.task.url,
    outputUrls: [],
  };
}

async function uploadReferenceImage(referenceImage: string) {
  const input = await loadReferenceImageBytes(referenceImage);
  const form = new FormData();
  const fileName = `fluxpost-${Date.now()}-${randomUUID()}${input.extension}`;
  form.append("image", new Blob([new Uint8Array(input.buffer)], { type: input.mimeType }), fileName);
  form.append("type", "input");
  form.append("subfolder", appConfig.comfyUiKleinUploadSubfolder);
  form.append("overwrite", "true");

  const response = await fetchWithTimeout(comfyUrl("upload/image"), {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ComfyUI image upload failed: ${response.status} ${body.slice(0, 240)}`);
  }

  const data = (await response.json()) as ComfyUploadedImage;
  if (!data.name) throw new Error("ComfyUI image upload did not return an image name.");
  return {
    name: data.name,
    subfolder: data.subfolder || appConfig.comfyUiKleinUploadSubfolder,
    type: data.type || "input",
  };
}

async function loadReferenceImageBytes(referenceImage: string) {
  const localFile = resolvePublicFilePath(referenceImage);
  if (localFile) {
    const buffer = await readFile(localFile);
    return {
      buffer,
      mimeType: mimeTypeFromFile(localFile),
      extension: extensionFromFile(localFile),
    };
  }

  if (!/^https?:\/\//i.test(referenceImage)) {
    throw new Error(`Unsupported ComfyUI reference image path: ${referenceImage}`);
  }

  const response = await fetchWithTimeout(referenceImage, {
    headers: buildMediaRequestHeaders(referenceImage),
  });
  if (!response.ok) {
    throw new Error(`Remote reference image download failed: HTTP ${response.status}`);
  }
  const contentType = normalizeMimeType(response.headers.get("content-type"), referenceImage);
  if (!contentType.startsWith("image/")) throw new Error(`Remote reference is not an image (${contentType}).`);
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: contentType,
    extension: extensionFromMimeType(contentType),
  };
}

async function buildKleinPrompt(taskPrompt: string, uploaded: Required<ComfyUploadedImage>) {
  const workflow = await readKleinWorkflow();
  const prompt = isApiPrompt(workflow) ? clonePrompt(workflow) : await convertUiWorkflowToPrompt(workflow);

  const imageNode = findPromptNode(prompt, appConfig.comfyUiKleinImageNodeId, "LoadImage");
  imageNode.inputs.image = uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name;

  const promptNode = findPromptNode(prompt, appConfig.comfyUiKleinPromptNodeId, "JjkText", "CLIPTextEncode");
  promptNode.inputs.text = taskPrompt;

  const kSamplerNode = findPromptNode(prompt, appConfig.comfyUiKleinKSamplerNodeId, "KSampler");
  applyKSamplerOverrides(kSamplerNode.inputs);

  return prompt;
}

async function readKleinWorkflow(): Promise<ComfyPrompt | ComfyUiWorkflow> {
  const workflowJson = appConfig.comfyUiKleinWorkflowJson.trim();
  if (workflowJson) return JSON.parse(workflowJson) as ComfyPrompt | ComfyUiWorkflow;
  if (!appConfig.comfyUiKleinWorkflowPath) throw new Error("COMFYUI_KLEIN_WORKFLOW_PATH is not configured.");
  return JSON.parse(await readFile(appConfig.comfyUiKleinWorkflowPath, "utf8")) as ComfyPrompt | ComfyUiWorkflow;
}

function hasComfyUiKleinWorkflow() {
  return Boolean(appConfig.comfyUiKleinWorkflowJson.trim() || appConfig.comfyUiKleinWorkflowPath);
}

function isApiPrompt(value: ComfyPrompt | ComfyUiWorkflow): value is ComfyPrompt {
  return !Array.isArray((value as ComfyUiWorkflow).nodes) && Object.values(value || {}).some((node) => Boolean(node?.class_type && node?.inputs));
}

async function convertUiWorkflowToPrompt(workflow: ComfyUiWorkflow): Promise<ComfyPrompt> {
  if (!Array.isArray(workflow.nodes)) throw new Error("ComfyUI Klein workflow file is not a supported UI or API workflow.");
  const objectInfo = await fetchComfyObjectInfo().catch(() => undefined);
  const links = new Map<number, [string, number]>();
  for (const link of workflow.links || []) {
    links.set(Number(link[0]), [String(link[1]), Number(link[2])]);
  }

  const prompt: ComfyPrompt = {};
  for (const node of workflow.nodes) {
    const nodeId = String(node.id);
    const inputs: Record<string, unknown> = {};
    const uiInputNames = new Set<string>();
    for (const input of node.inputs || []) {
      uiInputNames.add(input.name);
      if (typeof input.link === "number" && links.has(input.link)) {
        inputs[input.name] = links.get(input.link);
      }
    }

    Object.assign(inputs, resolveWidgetInputs(node, uiInputNames, objectInfo));
    prompt[nodeId] = {
      class_type: node.type,
      inputs,
    };
  }
  applyUseEverywhereLinks(workflow, prompt);
  return prompt;
}

function applyUseEverywhereLinks(workflow: ComfyUiWorkflow, prompt: ComfyPrompt) {
  if (!Array.isArray(workflow.extra?.ue_links) || !Array.isArray(workflow.nodes)) return;
  const nodesById = new Map(workflow.nodes.map((node) => [String(node.id), node]));
  for (const link of workflow.extra.ue_links) {
    const downstreamId = String(link.downstream);
    const downstreamNode = nodesById.get(downstreamId);
    const inputName = downstreamNode?.inputs?.[link.downstream_slot]?.name;
    if (!inputName || !prompt[downstreamId]) continue;
    prompt[downstreamId].inputs[inputName] = [String(link.upstream), Number(link.upstream_slot)];
  }
}

function resolveWidgetInputs(node: ComfyUiWorkflowNode, uiInputNames: Set<string>, objectInfo?: ComfyObjectInfo) {
  const values = node.widgets_values || [];
  if (!values.length) return {};
  if (node.type === "KSampler") return resolveKSamplerWidgetInputs(values);

  const names = widgetInputNamesFromObjectInfo(node, uiInputNames, objectInfo) || fallbackWidgetInputNames(node.type);
  return Object.fromEntries(names.slice(0, values.length).map((name, index) => [name, values[index]]));
}

function resolveKSamplerWidgetInputs(values: unknown[]) {
  return {
    seed: normalizeSeed(values[0]),
    steps: numberOrFallback(values[2], 8),
    cfg: numberOrFallback(values[3], 1),
    sampler_name: typeof values[4] === "string" ? values[4] : "euler",
    scheduler: typeof values[5] === "string" ? values[5] : "simple",
    denoise: numberOrFallback(values[6], 1),
  };
}

function widgetInputNamesFromObjectInfo(node: ComfyUiWorkflowNode, uiInputNames: Set<string>, objectInfo?: ComfyObjectInfo) {
  const input = objectInfo?.[node.type]?.input;
  if (!input) return undefined;
  return [...Object.keys(input.required || {}), ...Object.keys(input.optional || {})].filter((name) => !uiInputNames.has(name));
}

function fallbackWidgetInputNames(classType: string) {
  if (classType === "LoadImage") return ["image", "upload"];
  if (classType === "JjkText") return ["text"];
  if (classType === "VAELoader") return ["vae_name"];
  if (classType === "UNETLoader") return ["unet_name", "weight_dtype"];
  if (classType === "CLIPLoader") return ["clip_name", "type", "device"];
  if (classType === "LoraLoaderModelOnly") return ["lora_name", "strength_model"];
  if (classType === "SaveImage" || classType === "SaveImageAndMetadata_") return ["filename_prefix", "metadata_mode"];
  return [];
}

function applyKSamplerOverrides(inputs: Record<string, unknown>) {
  if (appConfig.comfyUiKleinRandomizeSeed) inputs.seed = randomComfySeed();
  if (typeof appConfig.comfyUiKleinSeed === "number") inputs.seed = Math.floor(appConfig.comfyUiKleinSeed);
  if (typeof appConfig.comfyUiKleinSteps === "number") inputs.steps = Math.floor(appConfig.comfyUiKleinSteps);
  if (typeof appConfig.comfyUiKleinCfg === "number") inputs.cfg = appConfig.comfyUiKleinCfg;
  if (appConfig.comfyUiKleinSamplerName) inputs.sampler_name = appConfig.comfyUiKleinSamplerName;
  if (appConfig.comfyUiKleinScheduler) inputs.scheduler = appConfig.comfyUiKleinScheduler;
  if (typeof appConfig.comfyUiKleinDenoise === "number") inputs.denoise = appConfig.comfyUiKleinDenoise;
}

async function queueComfyPrompt(prompt: ComfyPrompt) {
  const response = await fetchWithTimeout(comfyUrl("prompt"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: appConfig.comfyUiKleinClientId,
      prompt,
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`ComfyUI prompt queue failed: ${response.status} ${body.slice(0, 360)}`);

  const data = JSON.parse(body) as ComfyQueuedPrompt;
  if (data.node_errors && Object.keys(data.node_errors).length) {
    throw new Error(`ComfyUI prompt validation failed: ${JSON.stringify(data.node_errors).slice(0, 420)}`);
  }
  if (!data.prompt_id) throw new Error("ComfyUI prompt queue did not return prompt_id.");
  return data.prompt_id;
}

async function waitForComfyOutput(promptId: string) {
  const deadline = Date.now() + appConfig.comfyUiKleinTimeoutMs;
  while (Date.now() < deadline) {
    const response = await fetchWithTimeout(comfyUrl(`history/${encodeURIComponent(promptId)}`), { method: "GET" }, appConfig.comfyUiKleinPollIntervalMs + 5_000);
    if (response.ok) {
      const history = (await response.json()) as ComfyHistoryResponse;
      const entry = history[promptId];
      const images = collectHistoryImages(entry);
      if (images.length) return images;
      if (entry?.status?.completed) {
        throw new Error(`ComfyUI prompt completed without image outputs: ${entry.status.status_str || "completed"}`);
      }
    }
    await sleep(appConfig.comfyUiKleinPollIntervalMs);
  }
  throw new Error(`ComfyUI Klein workflow timed out after ${Math.round(appConfig.comfyUiKleinTimeoutMs / 1000)}s.`);
}

function collectHistoryImages(entry?: ComfyHistoryEntry) {
  if (!entry?.outputs) return [];
  const preferred = entry.outputs[appConfig.comfyUiKleinSaveNodeId]?.images || [];
  if (preferred.length) return preferred;
  return Object.values(entry.outputs).flatMap((output) => output.images || []);
}

async function saveComfyOutputImages(images: ComfyOutputImage[]) {
  const outputDir = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "generated", "source-edits");
  const tempDir = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "tmp", "comfy-output-strip");
  await mkdir(outputDir, { recursive: true });
  await mkdir(tempDir, { recursive: true });
  const urls: string[] = [];

  for (const [index, image] of images.entries()) {
    if (!image.filename) continue;
    const response = await fetchWithTimeout(comfyViewUrl(image), { method: "GET" });
    if (!response.ok) {
      throw new Error(`ComfyUI output download failed: ${response.status}`);
    }
    const inputExtension = extensionFromFile(image.filename) || extensionFromMimeType(normalizeMimeType(response.headers.get("content-type"), image.filename));
    const tempBase = `source-edit-input-${Date.now()}-${randomUUID()}-${index + 1}`;
    const tempInput = path.join(tempDir, `${tempBase}${inputExtension}`);
    const fileName = `source-edit-${Date.now()}-${randomUUID()}-${index + 1}.png`;
    const outputFile = path.join(outputDir, fileName);

    try {
      await writeFile(tempInput, Buffer.from(await response.arrayBuffer()));
      await stripComfyOutputMetadataWithFfmpeg(tempInput, outputFile);
      urls.push(`/generated/source-edits/${fileName}`);
    } catch (error) {
      await rm(outputFile, { force: true }).catch(() => undefined);
      throw error;
    } finally {
      await rm(tempInput, { force: true }).catch(() => undefined);
    }
  }

  if (!urls.length) throw new Error("ComfyUI output image list was empty.");
  return urls;
}

function stripComfyOutputMetadataWithFfmpeg(inputFile: string, outputFile: string) {
  return new Promise<void>((resolve, reject) => {
    const child = execFile(
      "ffmpeg",
      ["-y", "-hide_banner", "-loglevel", "error", "-i", inputFile, "-map_metadata", "-1", "-frames:v", "1", outputFile],
      { timeout: outputMetadataStripTimeoutMs },
      (error, _stdout, stderr) => {
        if (error) {
          const detail = stderr?.toString().trim().split(/\r?\n/).slice(-2).join(" ") || error.message;
          reject(new Error(`ComfyUI output metadata strip failed: ${detail.slice(0, 240)}`));
          return;
        }
        resolve();
      },
    );
    child.on("error", reject);
  });
}

async function fetchComfyObjectInfo() {
  comfyUiObjectInfoCache.promise ||= fetchWithTimeout(comfyUrl("object_info"), { method: "GET" }).then(async (response) => {
    if (!response.ok) throw new Error(`ComfyUI object_info failed: HTTP ${response.status}`);
    return (await response.json()) as ComfyObjectInfo;
  });
  return comfyUiObjectInfoCache.promise;
}

function findPromptNode(prompt: ComfyPrompt, configuredId: string, ...classTypes: string[]) {
  const configured = prompt[configuredId];
  if (configured) return configured;
  const match = Object.values(prompt).find((node) => classTypes.includes(node.class_type));
  if (!match) throw new Error(`ComfyUI Klein workflow is missing node ${configuredId} (${classTypes.join("/")}).`);
  return match;
}

function clonePrompt(prompt: ComfyPrompt): ComfyPrompt {
  return JSON.parse(JSON.stringify(prompt)) as ComfyPrompt;
}

function comfyUrl(relativePath: string) {
  const cleanPath = relativePath.replace(/^\/+/, "");
  return `${appConfig.comfyUiBaseUrl}/${cleanPath}`;
}

function comfyViewUrl(image: ComfyOutputImage) {
  const params = new URLSearchParams();
  params.set("filename", image.filename || "");
  params.set("type", image.type || "output");
  if (image.subfolder) params.set("subfolder", image.subfolder);
  return `${comfyUrl("view")}?${params.toString()}`;
}

function resolvePublicFilePath(value: string) {
  if (!value.startsWith("/")) return null;
  const cleanPath = decodeURIComponent(value.split("?")[0] || "").replace(/^\/+/, "");
  const publicRoot = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "public");
  const filePath = path.resolve(publicRoot, cleanPath);
  if (filePath !== publicRoot && filePath.startsWith(`${publicRoot}${path.sep}`)) return filePath;
  return null;
}

function mimeTypeFromFile(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "image/png";
}

function normalizeMimeType(contentType: string | null, source: string) {
  const mimeType = contentType?.split(";")[0]?.trim().toLowerCase();
  if (mimeType) return mimeType;
  return mimeTypeFromFile(source);
}

function extensionFromFile(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return extension || ".png";
}

function extensionFromMimeType(mimeType: string) {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  return ".png";
}

function randomComfySeed() {
  return Math.floor(Math.random() * 1_000_000_000_000_000);
}

function normalizeSeed(value: unknown) {
  const seed = numberOrFallback(value, randomComfySeed());
  return Math.max(0, Math.floor(seed));
}

function numberOrFallback(value: unknown, fallback: number) {
  const candidate = Number(value);
  return Number.isFinite(candidate) ? candidate : fallback;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = appConfig.comfyUiKleinTimeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`ComfyUI request timed out after ${Math.round(timeoutMs / 1000)}s: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
