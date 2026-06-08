import { mergeDownloadedAndRemoteImages } from "./media-url-filter";
import { maxVideoHighlightFrames, selectBestVideoHighlightFrames } from "./video-frame-policy";
import type { ImageStrategyPrompts, NormalizedSourceItem, ProductionPlan, SourceImageTask, VisualTag } from "./types";

export const defaultImageWashPrompt =
  "根据图上的信息，重新设计整张图片，背景浅色调，文字更有设计感，更有辨识度，无衬线。除了原图的文字意外，不要新增任何其他文字信息。";

export const defaultCarExteriorWashPrompt =
  "洗图：更换背景。背景无文字，车牌打马赛克。保持车辆主体清晰完整，不改变车辆外观结构和车身比例，整体画面适合社交媒体发布。";

export const defaultPeopleWithCarWashPrompt =
  "洗图：更换背景和人物。保持车辆主体清晰完整，重新生成更自然、更适合社交媒体传播的人物和场景氛围，不新增文字信息。";

export const defaultImageStrategyPrompts: ImageStrategyPrompts = {
  carExterior: defaultCarExteriorWashPrompt,
  textImage: defaultImageWashPrompt,
  peopleWithCar: defaultPeopleWithCarWashPrompt,
};

export const imageReferenceSizeInstruction = "参考图进入图片处理前统一尺寸：保持原图比例，等比例缩放，最长边为 2400px。";

export function buildDefaultImageTasks(
  source: NormalizedSourceItem,
  prompts: Partial<ImageStrategyPrompts> | string = defaultImageStrategyPrompts,
): SourceImageTask[] {
  const resolvedPrompts = resolveImageStrategyPrompts(prompts);
  const visualTagsByUrl = getVisualTagsByUrl(source);
  const frameTasks = getSourceVideoFrameTasks(source, resolvedPrompts.textImage, visualTagsByUrl, resolvedPrompts);
  if (shouldUseVideoFramesAsImageTasks(source) && frameTasks.length) {
    return frameTasks.slice(0, maxVideoHighlightFrames);
  }

  const imageTasks = getDisplaySourceImages(source).map((url, index) =>
    applyVisualTagImageStrategy(
      {
        id: `source-image-${index + 1}`,
        url,
        kind: "source_image" as const,
        label: `原图 ${index + 1}`,
        selected: true,
        mode: "wash" as const,
        prompt: resolvedPrompts.textImage,
      },
      visualTagsByUrl.get(url),
      resolvedPrompts,
    ),
  );

  return imageTasks.slice(0, 12);
}

export function resolveImageStrategyPrompts(prompts?: Partial<ImageStrategyPrompts> | string): ImageStrategyPrompts {
  if (typeof prompts === "string") {
    return {
      ...defaultImageStrategyPrompts,
      textImage: prompts.trim() || defaultImageStrategyPrompts.textImage,
    };
  }

  return {
    carExterior: stringOrDefault(prompts?.carExterior, defaultImageStrategyPrompts.carExterior),
    textImage: stringOrDefault(prompts?.textImage, defaultImageStrategyPrompts.textImage),
    peopleWithCar: stringOrDefault(prompts?.peopleWithCar, defaultImageStrategyPrompts.peopleWithCar),
  };
}

export function applyVisualTagImageStrategy(
  task: SourceImageTask,
  tag: VisualTag | undefined,
  prompts: Partial<ImageStrategyPrompts> | string = defaultImageStrategyPrompts,
): SourceImageTask {
  const resolvedPrompts = resolveImageStrategyPrompts(prompts);

  if (tag === "内饰空间") {
    return {
      ...task,
      mode: "keep",
      prompt: "",
    };
  }

  if (tag === "汽车外观") {
    return {
      ...task,
      mode: "wash",
      prompt: resolvedPrompts.carExterior,
    };
  }

  if (tag === "人车美图") {
    return {
      ...task,
      mode: "wash",
      prompt: resolvedPrompts.peopleWithCar,
    };
  }

  return {
    ...task,
    mode: "wash",
    prompt: resolvedPrompts.textImage,
  };
}

function getSourceVideoFrameTasks(
  source: NormalizedSourceItem,
  prompt: string,
  visualTagsByUrl: Map<string, VisualTag>,
  prompts: ImageStrategyPrompts,
): SourceImageTask[] {
  return selectBestVideoHighlightFrames(source.videoFrames).map((frame, index) =>
    applyVisualTagImageStrategy(
      {
        id: `video-frame-${frame.id || index + 1}`,
        url: frame.url,
        kind: "video_frame" as const,
        label: `关键帧 ${index + 1}`,
        selected: true,
        mode: "wash" as const,
        prompt,
        timestamp: frame.timestamp,
      },
      visualTagsByUrl.get(frame.url),
      prompts,
    ),
  );
}

export function mergeProductionPlan(basePlan: ProductionPlan, override?: ProductionPlan): ProductionPlan {
  if (!override) return basePlan;
  return {
    ...basePlan,
    ...override,
    materialRequirements: {
      ...basePlan.materialRequirements,
      ...override.materialRequirements,
    },
    promptGuidance: {
      ...basePlan.promptGuidance,
      ...override.promptGuidance,
    },
    workflow: override.workflow?.length ? override.workflow : basePlan.workflow,
    riskFlags: override.riskFlags ?? basePlan.riskFlags,
  };
}

export function formatImageTasksForPrompt(tasks?: SourceImageTask[]) {
  const selectedTasks = (tasks || []).filter((task) => task.selected);
  if (!selectedTasks.length) return "用户未选择需要处理或保留的图片。";

  return selectedTasks
    .map((task, index) =>
      [
        `图片任务 ${index + 1}: ${task.label}`,
        `素材类型: ${task.kind === "video_frame" ? "视频关键帧" : "图文原图"}`,
        `处理方式: ${formatImageTaskModeForPrompt(task.mode)}`,
        `素材链接: ${task.url}`,
        task.mode === "keep" ? "图片提示词: 保持原图，不调用图片模型。" : `图片提示词: ${task.prompt}`,
      ].join("\n"),
    )
    .join("\n\n");
}

export function buildCombinedImagePrompt(basePrompt: string, tasks?: SourceImageTask[]) {
  const selectedTasks = (tasks || []).filter((task) => task.selected);
  if (!selectedTasks.length) return basePrompt;

  return [
    basePrompt,
    "",
    "用户选择的图片处理任务如下。生成图片时优先遵守这些任务；如果任务中包含原图链接或关键帧链接，请将其作为视觉参考。",
    formatImageTasksForPrompt(selectedTasks),
  ].join("\n");
}

export function buildSingleImageTaskPrompt(basePrompt: string, task: SourceImageTask) {
  const taskPrompt = (typeof task.prompt === "string" ? task.prompt.trim() : "") || defaultImageWashPrompt;
  const contextPrompt = typeof basePrompt === "string" ? basePrompt.trim() : "";
  return [
    taskPrompt,
    "",
    `处理对象: ${task.label}`,
    `素材类型: ${task.kind === "video_frame" ? "视频关键帧" : "图文原图"}`,
    `处理方式: ${formatImageTaskModeForPrompt(task.mode)}`,
    `参考图片链接: ${task.url}`,
    imageReferenceSizeInstruction,
    "本次只处理这一张参考图片，不要混合其他原图、关键帧或素材任务。",
    "如果参考图里有文字，只保留原图文字信息的语义和层级，不新增其他文字信息。",
    contextPrompt ? `图文语境参考: ${contextPrompt}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatImageTaskModeForPrompt(mode: SourceImageTask["mode"]) {
  if (mode === "wash") return "洗图";
  if (mode === "reconstruct") return "重构";
  return "保持原图";
}

function getDisplaySourceImages(source: NormalizedSourceItem) {
  return mergeDownloadedAndRemoteImages(source.downloadedImages, source.images, { preferDownloaded: true });
}

function getVisualTagsByUrl(source: NormalizedSourceItem) {
  return new Map((source.visualTagging?.assets || []).map((asset) => [asset.url, asset.tag]));
}

function shouldUseVideoFramesAsImageTasks(source: NormalizedSourceItem) {
  return Boolean(
    source.videoFrames?.length &&
      (source.mediaType === "video" || source.mediaType === "mixed" || source.videoUrl || source.downloadedVideoUrl),
  );
}

function stringOrDefault(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
