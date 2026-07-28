import type { CanvasNodeConfig } from "./types";

export const canvasPromptPresets = {
  custom: "{{input}}",
  title: "请根据以下内容生成一个简洁、有信息量的社交媒体标题，只输出标题。\n\n{{input}}",
  body: "请将以下内容改写为结构清晰、可直接发布的中文社交媒体正文。\n\n{{input}}",
  image_prompt: "请根据以下内容生成一段具体的图片生成提示词，说明主体、场景、构图、光线和质感。\n\n{{input}}",
  video_storyboard: "请根据以下内容生成短视频分镜方案，逐镜头说明画面、动作、景别和节奏。\n\n{{input}}",
} as const;

export const canvasVisionPresets = {
  describe: "准确描述图片中的主体、场景、动作、文字和重要细节，不确定的信息不要猜测。",
  selling_points: "从图片中提取适合社交媒体文案使用的产品卖点和可观察证据。",
  composition: "分析图片的景别、视角、主体位置、视觉层级、光线、色彩和版式。",
  ocr: "识别图片中清晰可见的文字，按图片顺序输出；无法确认的字符标记为[不清晰]。",
  image_prompt: "把图片的可复用视觉特征整理为图片生成提示词，不复制品牌、车牌、水印或人物身份。",
} as const;

export function renderCanvasPromptTemplate(config: CanvasNodeConfig, values: string[]) {
  const preset = String(config.preset || "custom") as keyof typeof canvasPromptPresets;
  const template = preset === "custom" ? String(config.template || "") : canvasPromptPresets[preset];
  if (!template?.trim()) throw new Error("Prompt template cannot be empty.");
  const referenced = Array.from(template.matchAll(/\{\{input(\d+)\}\}/g), (match) => Number(match[1]));
  const missing = referenced.find((index) => index < 1 || index > values.length);
  if (missing !== undefined) throw new Error(`Prompt template references missing input${missing}.`);
  return template
    .replaceAll("{{input}}", values.join("\n\n"))
    .replace(/\{\{input(\d+)\}\}/g, (_match, value: string) => values[Number(value) - 1] || "")
    .trim();
}

export function splitCanvasText(
  config: CanvasNodeConfig,
  value: string,
  options: { fallbackToBody?: boolean } = {},
): { head?: string; tail: string } {
  const normalized = value.trim();
  if (!normalized) throw new Error("Text split input cannot be empty.");
  const mode = String(config.mode || "first-line");
  const delimiter = mode === "delimiter" ? String(config.delimiter || "") : "\n";
  if (!delimiter) throw new Error("Text split delimiter cannot be empty.");
  const delimiterIndex = mode === "delimiter" ? Number(config.delimiterIndex ?? 1) : 1;
  if (!Number.isInteger(delimiterIndex) || delimiterIndex < 1) throw new Error("Text split delimiter index must be a positive integer.");
  const index = findDelimiterIndex(normalized, delimiter, delimiterIndex);
  if (index < 0) {
    if (options.fallbackToBody) return { tail: normalized };
    throw new Error(mode === "delimiter" ? "Text does not contain the configured delimiter." : "Text split requires a title line and body.");
  }
  const head = normalized.slice(0, index).trim();
  const tail = normalized.slice(index + delimiter.length).trim();
  if (!head || !tail) {
    if (options.fallbackToBody) return { tail: normalized };
    throw new Error("Text split must produce both head and tail values.");
  }
  return { head, tail };
}

function findDelimiterIndex(value: string, delimiter: string, occurrence: number) {
  let index = -1;
  let fromIndex = 0;
  for (let current = 0; current < occurrence; current += 1) {
    index = value.indexOf(delimiter, fromIndex);
    if (index < 0) return -1;
    fromIndex = index + delimiter.length;
  }
  return index;
}

export function parseCanvasImageSelection(value: CanvasNodeConfig[string]) {
  const source = String(value || "").trim();
  if (!source) throw new Error("Image selection indices cannot be empty.");
  const entries = source.split(",").map((item) => item.trim());
  if (entries.some((item) => !/^\d+$/.test(item))) throw new Error("Image selection indices must be comma-separated positive integers.");
  const result = Array.from(new Set(entries.map(Number)));
  if (!result.length || result.some((index) => index < 1 || index > 100)) throw new Error("Image selection indices must be between 1 and 100.");
  return result;
}

export function resolveCanvasImageDimensions(config: CanvasNodeConfig) {
  const preset = String(config.preset || "xiaohongshu");
  const dimensions: Record<string, { width: number; height: number }> = {
    xiaohongshu: { width: 1080, height: 1440 },
    square: { width: 1080, height: 1080 },
    landscape: { width: 1920, height: 1080 },
  };
  const resolved = dimensions[preset] || { width: Number(config.width), height: Number(config.height) };
  if (!Number.isInteger(resolved.width) || !Number.isInteger(resolved.height) || resolved.width < 64 || resolved.height < 64 || resolved.width > 4096 || resolved.height > 4096) {
    throw new Error("Image transform dimensions must be integers from 64 to 4096.");
  }
  return resolved;
}

export function parseCanvasVideoTimestamps(config: CanvasNodeConfig, durationSeconds?: number) {
  const mode = String(config.mode || "even");
  if (mode === "cover") return [Math.max(0, Number(config.coverSeconds || 0.5))];
  if (mode === "timestamps") {
    const entries = String(config.timestamps || "").split(",").map((item) => item.trim()).filter(Boolean);
    if (!entries.length || entries.some((item) => !/^\d+(?:\.\d+)?$/.test(item))) throw new Error("Video frame timestamps must be comma-separated seconds.");
    const timestamps = Array.from(new Set(entries.map(Number)));
    if (timestamps.length > 20) throw new Error("Video frame extraction accepts at most 20 timestamps.");
    if (durationSeconds !== undefined && timestamps.some((value) => value >= durationSeconds)) throw new Error("A video frame timestamp exceeds the video duration.");
    return timestamps;
  }
  const count = Number(config.count || 4);
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error("Even video frame count must be an integer from 1 to 20.");
  if (durationSeconds === undefined || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
  return Array.from({ length: count }, (_value, index) => Math.max(0, (durationSeconds * (index + 1)) / (count + 1)));
}
