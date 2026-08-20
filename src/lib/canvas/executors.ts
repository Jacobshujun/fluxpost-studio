import { randomUUID } from "node:crypto";
import { enqueueFeishuPublishJob, ensureFeishuPublishQueueWorker } from "../feishu-publish-queue";
import { normalizeFeishuPublishMode } from "../feishu-publish-mode";
import { FINISHED_BODY_POLICY_VERSION, truncateFinishedBody } from "../finished-body-policy";
import { saveGeneratedPost } from "../generated-posts";
import { generateCanvasGptImages, generateImagesFromPrompt } from "../image-generation";
import { callOpenAIForText, callOpenAIForVisionText } from "../openai";
import type { GeneratedPost, SourceImageTask } from "../types";
import type { WorkspaceAccessActor } from "../workspace-ownership";
import { ArkSeedanceNeedsConfigError, queryArkSeedanceVideo, submitArkSeedanceVideo } from "./seedance";
import { resolveSeedanceInput } from "./seedance-references";
import { CanvasMediaNeedsConfigError, extractCanvasVideoFrames, reconstructCanvasVideo, transformCanvasImages } from "./media-tools";
import { canvasVisionPresets, concatenateCanvasText, parseCanvasImageSelection, renderCanvasPromptTemplate, splitCanvasText } from "./node-utils";
import { normalizeUrlList } from "./registry";
import { CANVAS_SAVE_IMAGE_MAX_ITEMS } from "./save-images";
import { canvasSourceVideoSnapshotFromConfig, isCanvasSourceVideoSnapshotCurrent } from "./source-video-contract";
import { canvasSubtitleStyleFromConfig } from "./subtitle-style";
import type { CanvasArtifact, CanvasMediaReference, CanvasNode, CanvasNodeRun } from "./types";
import { addCanvasVideoSubtitles } from "./video-subtitles";
import { selectedCanvasVideo } from "./video-loader";

export class CanvasNeedsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanvasNeedsConfigError";
  }
}

export type CanvasNodeExecutionContext = {
  runId: string;
  node: CanvasNode;
  inputs: Record<string, CanvasArtifact[]>;
  account: WorkspaceAccessActor;
  previousNodeRun?: CanvasNodeRun;
  onProviderTaskUpdate?: (state: {
    taskId: string;
    route: "primary" | "backup";
    status: string;
    resolvedInputs?: Record<string, CanvasArtifact[]>;
  }) => Promise<void>;
};

export type CanvasNodeExecutionResult = {
  outputs: Record<string, CanvasArtifact>;
  resolvedInputs?: Record<string, CanvasArtifact[]>;
  providerTaskId?: string;
  providerTaskRoute?: "primary" | "backup";
  providerStatus?: string;
  pending?: boolean;
};

type CanvasNodeExecutor = (context: CanvasNodeExecutionContext) => Promise<CanvasNodeExecutionResult>;

const executors: Record<CanvasNode["type"], CanvasNodeExecutor> = {
  "input.text": executeLiteralNode,
  "input.images": executeLiteralNode,
  "input.videos": executeLiteralNode,
  "input.video-loader": executeLiteralNode,
  "input.source-video": executeLiteralNode,
  "input.content-pool": executeLiteralNode,
  "input.library-images": executeLiteralNode,
  "input.copy-library": executeLiteralNode,
  "model.gpt-text": executeGptText,
  "model.gpt-image": executeGptImage,
  "model.gpt-vision": executeGptVision,
  "model.seedance": executeSeedance,
  "utility.image-preview": executeImagePreview,
  "utility.save-images": executeSaveImages,
  "utility.display-any": executeDisplayAny,
  "utility.video-reconstruct": executeVideoReconstruct,
  "utility.video-subtitles": executeVideoSubtitles,
  "utility.prompt-template": executePromptTemplate,
  "utility.text-concatenate": executeTextConcatenate,
  "utility.prompt-switch": executePromptSwitch,
  "utility.text-split": executeTextSplit,
  "utility.image-select": executeImageSelect,
  "utility.image-transform": executeImageTransform,
  "utility.video-frames": executeVideoFrames,
  "compose.social-post": executeComposition,
  "publish.feishu": executeFeishuPublish,
};

export async function executeCanvasNode(context: CanvasNodeExecutionContext) {
  return executors[context.node.type](context);
}

async function executeLiteralNode({ node }: CanvasNodeExecutionContext) {
  const outputs = resolveCanvasLiteralOutputs(node);
  if (!outputs) throw new Error(`Canvas node ${node.type} is not a literal input.`);
  return { outputs };
}

export function resolveCanvasLiteralOutputs(node: CanvasNode): Record<string, CanvasArtifact> | undefined {
  if (node.type === "input.text") return { text: { kind: "text", value: String(node.config.text || "").trim() } };
  if (node.type === "input.images") return { images: imageArtifact(normalizeUrlList(node.config.urls)) };
  if (node.type === "input.videos") return { videos: videoArtifact(normalizeUrlList(node.config.urls)) };
  if (node.type === "input.video-loader") {
    const video = selectedCanvasVideo(node.config);
    if (!video) throw new Error("视频加载节点没有有效的当前视频。");
    return { videos: { kind: "videos", items: [{ url: video.url, name: video.filename, mimeType: video.mimeType, width: video.width, height: video.height, durationSeconds: video.durationSeconds }] } };
  }
  if (node.type === "input.source-video") {
    const source = canvasSourceVideoSnapshotFromConfig(node.config);
    if (!source || !isCanvasSourceVideoSnapshotCurrent(node.config)) throw new Error("Source video snapshot is missing or stale. Resolve the source link again.");
    return { videos: { kind: "videos", items: [{ url: source.url, name: source.title, width: source.width, height: source.height, durationSeconds: source.durationSeconds }] } };
  }
  if (node.type === "input.library-images") {
    const names = stringList(node.config.assetNames);
    return { images: { kind: "images", items: normalizeUrlList(node.config.urls).map((url, index) => ({ url, name: names[index] })) } };
  }
  if (node.type === "input.content-pool") {
    const outputs: Record<string, CanvasArtifact> = {};
    const title = String(node.config.snapshotTitle || "").trim();
    const body = String(node.config.snapshotBody || "").trim();
    const source = String(node.config.snapshotSourceUrl || "").trim();
    const images = normalizeUrlList(node.config.snapshotImageUrls);
    const videos = normalizeUrlList(node.config.snapshotVideoUrls);
    if (title) outputs.title = { kind: "text", value: title };
    if (body) outputs.body = { kind: "text", value: body };
    if (source) outputs.source = { kind: "text", value: source };
    if (images.length) outputs.images = imageArtifact(images);
    if (videos.length) outputs.videos = videoArtifact(videos);
    return outputs;
  }
  if (node.type === "input.copy-library") {
    return {
      title: { kind: "text", value: String(node.config.snapshotTitle || "").trim() },
      body: { kind: "text", value: String(node.config.snapshotBody || "").trim() },
    };
  }
  return undefined;
}

async function executeImagePreview({ inputs }: CanvasNodeExecutionContext) {
  const items = (inputs.images || []).flatMap((artifact) => artifact.kind === "images" ? artifact.items : []);
  if (!items.length) throw new Error("Image preview requires a successful upstream image result.");
  return { outputs: { images: { kind: "images" as const, items: structuredClone(items) } } };
}

async function executeSaveImages({ inputs }: CanvasNodeExecutionContext) {
  const items = imageItems(inputs.images);
  if (!items.length || items.length > CANVAS_SAVE_IMAGE_MAX_ITEMS) {
    throw new Error(`Save images requires 1 to ${CANVAS_SAVE_IMAGE_MAX_ITEMS} images.`);
  }
  return { outputs: { downloads: { kind: "images" as const, items: structuredClone(items) } } };
}

async function executeDisplayAny({ inputs }: CanvasNodeExecutionContext) {
  const artifacts = inputs.value || [];
  if (artifacts.length !== 1) throw new Error("展示任何需要且仅允许一个上游结果。");
  return { outputs: { preview: structuredClone(artifacts[0]) } };
}

async function executeVideoReconstruct({ inputs }: CanvasNodeExecutionContext) {
  const sourceItems = (inputs.source || []).flatMap((artifact) => artifact.kind === "videos" ? artifact.items : []);
  const replacements: Array<{ item: CanvasMediaReference; kind: "image" | "video" }> = [];
  for (const artifact of inputs.replacement || []) {
    if (artifact.kind === "images") replacements.push(...artifact.items.map((item) => ({ item, kind: "image" as const })));
    if (artifact.kind === "videos") replacements.push(...artifact.items.map((item) => ({ item, kind: "video" as const })));
  }
  if (sourceItems.length !== 1) throw new Error(`Video reconstruction requires exactly one source video; resolved ${sourceItems.length}.`);
  if (replacements.length !== 1) throw new Error(`Video reconstruction requires exactly one replacement image or video; resolved ${replacements.length}.`);
  const replacement = replacements[0];
  const output = await reconstructCanvasVideo({ source: sourceItems[0], replacement: replacement.item, replacementKind: replacement.kind });
  return { outputs: { videos: { kind: "videos" as const, items: [output] } } };
}

async function executeVideoSubtitles({ node, inputs, account }: CanvasNodeExecutionContext) {
  const items = videoItems(inputs.videos);
  if (items.length !== 1) throw new Error(`Video subtitles requires exactly one source video; resolved ${items.length}.`);
  try {
    const result = await addCanvasVideoSubtitles({ source: items[0], style: canvasSubtitleStyleFromConfig(node.config), ownerUserId: account.id });
    return {
      outputs: {
        videos: { kind: "videos" as const, items: [result.video] },
        text: { kind: "text" as const, value: result.text },
      },
    };
  } catch (error) {
    if (error instanceof CanvasMediaNeedsConfigError) {
      throw new CanvasNeedsConfigError(error.message);
    }
    throw error;
  }
}

async function executePromptTemplate({ node, inputs }: CanvasNodeExecutionContext) {
  const value = renderCanvasPromptTemplate(node.config, textValues(inputs.values));
  return { outputs: { text: { kind: "text" as const, value } } };
}

async function executeTextConcatenate({ node, inputs }: CanvasNodeExecutionContext) {
  const values = ["text_a", "text_b", "text_c", "text_d"].flatMap((port) => textValues(inputs[port]));
  const value = concatenateCanvasText(node.config, values);
  return { outputs: { text: { kind: "text" as const, value } } };
}

async function executePromptSwitch({ node, inputs }: CanvasNodeExecutionContext) {
  const port = node.version === 1
    ? node.config.strategy === "scene-modification" ? "sceneModification" : node.config.strategy === "scene-person" ? "scenePerson" : "scene"
    : `input${String(node.config.selectedInput || "1")}`;
  const values = textValues(inputs[port]);
  if (values.length !== 1 || !values[0].trim()) throw new Error("提示词 Switch 所选输入需要且仅允许一个非空文字输入。");
  return { outputs: { text: { kind: "text" as const, value: values[0].trim() } } };
}

async function executeTextSplit({ node, inputs }: CanvasNodeExecutionContext) {
  const value = splitCanvasText(node.config, textValues(inputs.text).join("\n\n"), { fallbackToBody: node.version >= 2 });
  const outputs: Record<string, CanvasArtifact> = { tail: { kind: "text", value: value.tail } };
  if (value.head !== undefined) outputs.head = { kind: "text", value: value.head };
  return { outputs };
}

async function executeImageSelect({ node, inputs }: CanvasNodeExecutionContext) {
  const items = imageItems(inputs.images);
  const indices = parseCanvasImageSelection(node.config.indices);
  const invalid = indices.find((index) => index > items.length);
  if (invalid !== undefined) throw new Error(`Image selection index ${invalid} exceeds the ${items.length} available images.`);
  return { outputs: { images: { kind: "images" as const, items: indices.map((index) => structuredClone(items[index - 1])) } } };
}

async function executeImageTransform({ node, inputs }: CanvasNodeExecutionContext) {
  try {
    const items = await transformCanvasImages(imageItems(inputs.images), node.config);
    return { outputs: { images: { kind: "images" as const, items } } };
  } catch (error) {
    if (error instanceof CanvasMediaNeedsConfigError) throw new CanvasNeedsConfigError(error.message);
    throw error;
  }
}

async function executeVideoFrames({ node, inputs }: CanvasNodeExecutionContext) {
  try {
    const items = await extractCanvasVideoFrames(videoItems(inputs.videos), node.config);
    return { outputs: { images: { kind: "images" as const, items } } };
  } catch (error) {
    if (error instanceof CanvasMediaNeedsConfigError) throw new CanvasNeedsConfigError(error.message);
    throw error;
  }
}

async function executeGptText({ node, inputs }: CanvasNodeExecutionContext) {
  const source = textValues(inputs.prompt).join("\n\n");
  const instruction = String(node.config.instruction || "").trim();
  const value = await callOpenAIForText(`${instruction}\n\n输入：\n${source}`, { logLabel: `Canvas GPT text node ${node.id}` });
  return { outputs: { text: { kind: "text" as const, value } } };
}

async function executeGptVision({ node, inputs }: CanvasNodeExecutionContext) {
  const items = imageItems(inputs.images);
  const maxImages = Number(node.config.maxImages || 8);
  if (!items.length || items.length > maxImages || items.length > 8) throw new Error(`Vision analysis accepts 1 to ${Math.min(maxImages, 8)} images.`);
  const instruction = resolveCanvasVisionInstruction(node, inputs.instruction);
  try {
    const value = await callOpenAIForVisionText(instruction, items.map((item) => item.url), { logLabel: `Canvas GPT vision node ${node.id}` });
    return { outputs: { text: { kind: "text" as const, value } } };
  } catch (error) {
    if (error instanceof Error && /OPENAI_API_KEY is not configured/i.test(error.message)) throw new CanvasNeedsConfigError(error.message);
    throw error;
  }
}

function resolveCanvasVisionInstruction(node: CanvasNode, artifacts: CanvasArtifact[] | undefined) {
  const userInstruction = textValues(artifacts).map((value) => value.trim()).filter(Boolean).join("\n\n");
  if (userInstruction) return userInstruction;
  const preset = String(node.config.preset || "describe") as keyof typeof canvasVisionPresets;
  return [canvasVisionPresets[preset], String(node.config.instruction || "").trim()].filter(Boolean).join("\n\n");
}

async function executeGptImage(context: CanvasNodeExecutionContext): Promise<CanvasNodeExecutionResult> {
  if (context.node.version === 1) return executeLegacyGptImage(context);
  const { node, inputs, previousNodeRun, onProviderTaskUpdate } = context;
  const prompt = textValues(inputs.prompt).join("\n\n").trim();
  const directReferences = normalizeUrlList(node.config.referenceUrls);
  const references = resolveCanvasGptImageReferences(directReferences, inputs.references || []);
  const resumableTask = previousNodeRun?.providerTaskId && previousNodeRun.providerStatus !== "failed"
    ? previousNodeRun
    : undefined;
  const ratio = String(node.config.ratio || "1:1");
  const resolution = String(node.config.resolution || "1k") as "1k" | "2k" | "4k";
  const result = await generateCanvasGptImages(prompt, Number(node.config.count || 1), references, {
    size: pixelSizeForRatio(ratio, resolution),
    ratio,
    resolution,
    quality: String(node.config.quality || "medium") as "low" | "medium" | "high",
    outputFormat: node.config.outputFormat === "jpeg" ? "jpeg" : "png",
    outputCompression: Number(node.config.outputCompression ?? 100),
  }, {
    resumeTaskId: resumableTask?.providerTaskId,
    resumeTaskRoute: resumableTask?.providerTaskRoute,
    resumeStatus: resumableTask?.providerStatus,
    onTaskUpdate: onProviderTaskUpdate,
  });
  if (result.status === "needs_config") throw new CanvasNeedsConfigError(result.message || "GPT-Image-2 is not configured.");
  if (result.status === "pending") {
    return {
      resolvedInputs: {
        ...inputs,
        references: [{ kind: "images" as const, items: references.map((url, index) => ({ url, name: `reference ${index + 1}` })) }],
      },
      outputs: {},
      providerTaskId: result.providerTaskId,
      providerTaskRoute: result.providerTaskRoute,
      providerStatus: result.providerStatus,
      pending: true,
    };
  }
  return {
    resolvedInputs: {
      ...inputs,
      references: [{ kind: "images" as const, items: references.map((url, index) => ({ url, name: `图片${index + 1}` })) }],
    },
    outputs: { images: { kind: "images" as const, items: result.imageUrls.map((url) => ({ url })) } },
  };
}

function resolveCanvasGptImageReferences(directReferences: string[], upstreamArtifacts: CanvasArtifact[]) {
  const ordered = [
    ...directReferences,
    ...upstreamArtifacts.flatMap((artifact) => artifact.kind === "images" ? artifact.items.map((item) => item.url) : []),
  ].map((url) => url.trim()).filter(Boolean);
  const references = Array.from(new Set(ordered));
  if (references.length > 16) throw new Error(`GPT-Image-2 accepts at most 16 reference images; resolved ${references.length}.`);
  return references;
}

async function executeLegacyGptImage({ node, inputs }: CanvasNodeExecutionContext) {
  const prompt = textValues(inputs.prompt).join("\n\n").trim();
  const references = mediaUrls(inputs.references, "images");
  const tasks: SourceImageTask[] = references.map((url, index) => ({
    id: `canvas-reference-${index + 1}`,
    url,
    kind: "source_image",
    label: `画布参考图 ${index + 1}`,
    selected: true,
    mode: "reconstruct",
    prompt,
  }));
  const result = await generateImagesFromPrompt(prompt, Number(node.config.count || 1), tasks, {
    size: String(node.config.size || "1024x1024"),
    quality: String(node.config.quality || "medium") as "low" | "medium" | "high",
    taskConcurrency: 1,
  });
  if (result.status === "needs_config") throw new CanvasNeedsConfigError(result.message || "GPT-Image-2 is not configured.");
  return { outputs: { images: { kind: "images" as const, items: result.imageUrls.map((url) => ({ url })) } } };
}

function pixelSizeForRatio(ratio: string, resolution: "1k" | "2k" | "4k") {
  const [widthRatio, heightRatio] = ratio.split(":").map(Number);
  const longestSide = resolution === "4k" ? 4096 : resolution === "2k" ? 2048 : 1024;
  if (!widthRatio || !heightRatio) return "1024x1024";
  const scale = longestSide / Math.max(widthRatio, heightRatio);
  return `${Math.max(64, Math.round(widthRatio * scale))}x${Math.max(64, Math.round(heightRatio * scale))}`;
}

async function executeSeedance({ node, inputs, previousNodeRun, onProviderTaskUpdate }: CanvasNodeExecutionContext) {
  try {
    const previousSubmitId = previousNodeRun?.providerTaskId;
    let resolvedInputs: Record<string, CanvasArtifact[]> | undefined;
    let submission;
    if (previousSubmitId) {
      submission = await queryArkSeedanceVideo(previousSubmitId);
    } else {
      const resolved = resolveSeedanceInput(node.config, inputs.prompt, mediaUrls(inputs.images, "images"));
      resolvedInputs = {
        ...inputs,
        prompt: [{ kind: "text", value: resolved.prompt }],
        images: [{ kind: "images", items: resolved.images.map((url, index) => ({ url, name: `图片${index + 1}` })) }],
      };
      submission = await submitArkSeedanceVideo({
          prompt: resolved.prompt,
          images: resolved.images,
          videos: mediaUrls(inputs.videos, "videos"),
          duration: Number(node.config.duration),
          ratio: String(node.config.ratio),
          resolution: String(node.config.resolution),
          generateAudio: typeof node.config.generateAudio === "boolean" ? node.config.generateAudio : true,
          watermark: typeof node.config.watermark === "boolean" ? node.config.watermark : true,
      });
      await onProviderTaskUpdate?.({ taskId: submission.taskId, route: "primary", status: submission.status, resolvedInputs });
    }
    const pending = !["success", "succeeded", "completed"].includes(submission.status) || submission.videoUrls.length === 0;
    return {
      outputs: {
        videos: {
          kind: "videos" as const,
          items: submission.videoUrls.map((url) => ({ url })),
          providerTaskId: submission.taskId,
          providerStatus: submission.status,
        },
      },
      providerTaskId: submission.taskId,
      providerStatus: submission.status,
      ...(resolvedInputs ? { resolvedInputs } : {}),
      pending,
    };
  } catch (error) {
    if (error instanceof ArkSeedanceNeedsConfigError) throw new CanvasNeedsConfigError(error.message);
    throw error;
  }
}

async function executeComposition({ node, inputs, runId, account }: CanvasNodeExecutionContext) {
  const bodies = textValues(inputs.body);
  const titles = textValues(inputs.title);
  const imageUrls = mediaUrls(inputs.images, "images");
  const videoUrls = mediaUrls(inputs.videos, "videos");
  const now = new Date().toISOString();
  const post: GeneratedPost = {
    id: `canvas-post-${Date.now()}-${randomUUID().slice(0, 8)}`,
    ownerUserId: account.id,
    ownerDisplayName: account.displayName || account.id,
    sourceItemId: `canvas:${runId}:${node.id}`,
    createdAt: now,
    title: titles.join(" ").trim() || String(node.config.fallbackTitle || "画布生成内容"),
    body: truncateFinishedBody(bodies.join("\n\n")),
    bodyPolicyVersion: FINISHED_BODY_POLICY_VERSION,
    taskKeyword: "无限画布",
    feishuVehicle: resolveCanvasCompositionVehicle(node, inputs.vehicle),
    platform: "original",
    imagePrompt: "",
    imageUrls,
    videoUrls,
    materialPaths: [],
    status: "draft",
    aiNotes: [`由无限画布运行 ${runId} 组装`],
    updatedAt: now,
  };
  const saved = await saveGeneratedPost(post, account);
  return { outputs: { post: { kind: "socialPost" as const, postId: saved.id, post: saved } } };
}

function resolveCanvasCompositionVehicle(node: CanvasNode, artifacts: CanvasArtifact[] | undefined) {
  return textValues(artifacts).join(" ").trim() || String(node.config.vehicle || "").trim() || undefined;
}

async function executeFeishuPublish({ node, inputs, runId, account }: CanvasNodeExecutionContext) {
  const artifacts = (inputs.post || []).filter((artifact): artifact is Extract<CanvasArtifact, { kind: "socialPost" }> => artifact.kind === "socialPost");
  if (!artifacts.length) throw new Error("Feishu publish requires a social post artifact.");
  const publishMode = normalizeFeishuPublishMode(node.config.publishMode);
  const job = await enqueueFeishuPublishJob(artifacts.map((artifact) => artifact.post), {
    ownerUserId: account.id,
    ownerDisplayName: account.displayName,
    source: "manual",
    sourceRunId: runId,
    publishMode,
  });
  ensureFeishuPublishQueueWorker();
  return { outputs: { job: { kind: "publishJobRef" as const, jobId: job.id, status: job.status } } };
}

function textValues(artifacts: CanvasArtifact[] | undefined) {
  return (artifacts || []).filter((artifact): artifact is Extract<CanvasArtifact, { kind: "text" }> => artifact.kind === "text").map((artifact) => artifact.value);
}

function mediaUrls(artifacts: CanvasArtifact[] | undefined, kind: "images" | "videos") {
  return (artifacts || []).flatMap((artifact) => {
    if (kind === "images" && artifact.kind === "images") return artifact.items.map((item) => item.url);
    if (kind === "videos" && artifact.kind === "videos") return artifact.items.map((item) => item.url);
    return [];
  });
}

function imageItems(artifacts: CanvasArtifact[] | undefined) {
  return (artifacts || []).flatMap((artifact) => artifact.kind === "images" ? artifact.items : []);
}

function videoItems(artifacts: CanvasArtifact[] | undefined) {
  return (artifacts || []).flatMap((artifact) => artifact.kind === "videos" ? artifact.items : []);
}

function imageArtifact(urls: string[]): Extract<CanvasArtifact, { kind: "images" }> {
  return { kind: "images", items: urls.map((url) => ({ url })) };
}

function videoArtifact(urls: string[]): Extract<CanvasArtifact, { kind: "videos" }> {
  return { kind: "videos", items: urls.map((url) => ({ url })) };
}

function stringList(value: CanvasNode["config"][string]) {
  return Array.isArray(value) ? value.map(String) : [];
}
