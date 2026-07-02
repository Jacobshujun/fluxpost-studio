import { callOpenAIForJson } from "./openai";
import { clampGeneratedTitleMax } from "./title-guard";
import type { ContentTag, GeneratedPost, WorkspacePromptSettings } from "./types";
import { contentTagOptions } from "./types";

export const maxOriginalImagePrompts = 5;

export type OriginalGeneratedDraft = {
  post: GeneratedPost;
  imagePrompts: string[];
  topic: string;
};

export async function buildOriginalGeneratedPost(input: {
  runId: string;
  prompt: string;
  vehicleKeyword?: string;
  settings: WorkspacePromptSettings;
  materialPaths: string[];
  useWebSearch: boolean;
}): Promise<OriginalGeneratedDraft> {
  const originalPrompt = normalizeOriginalPrompt(input.prompt);
  if (!originalPrompt) throw new Error("Original prompt is required");

  const topic = extractOriginalTopic(originalPrompt);
  const vehicleKeyword = normalizeOriginalVehicleKeyword(input.vehicleKeyword) || topic || "原创";
  const json = await callOpenAIForJson(buildOriginalPrompt(originalPrompt, vehicleKeyword, input.settings, input.materialPaths), {
    webSearch: input.useWebSearch,
    logLabel: input.useWebSearch ? "准备联网生成原创图文 Prompt" : "准备生成原创图文 Prompt",
  });
  const imagePrompts = arrayOfStrings(json.imagePrompts).slice(0, maxOriginalImagePrompts);
  const body = stringFromJson(json.body, "");
  const title = clampGeneratedTitleMax(stringFromJson(json.title, topic || "原创图文"));
  const now = new Date().toISOString();

  return {
    topic,
    imagePrompts,
    post: {
      id: `post-original-${input.runId}-${Date.now()}`,
      sourceItemId: `original-${input.runId}`,
      platform: "original",
      title,
      body,
      taskKeyword: vehicleKeyword,
      feishuVehicle: vehicleKeyword,
      imagePrompt: imagePrompts.join("\n\n"),
      imageUrls: [],
      contentTags: normalizeContentTags(json.contentTags),
      materialPaths: input.materialPaths,
      status: "draft",
      aiNotes: [
        ...arrayOfStrings(json.aiNotes),
        input.useWebSearch ? "原创模式已启用联网搜索。" : "原创模式未启用联网搜索。",
      ],
      createdAt: now,
      updatedAt: now,
    },
  };
}

export function extractOriginalTopic(prompt: string) {
  const firstLine = normalizeOriginalPrompt(prompt).split(/\r?\n/).find((line) => line.trim()) || "";
  const normalized = firstLine
    .replace(/^[#\s:：\-—]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  return (normalized || "原创").slice(0, 96);
}

function buildOriginalPrompt(prompt: string, vehicleKeyword: string, settings: WorkspacePromptSettings, materialPaths: string[]) {
  return [
    "你是社交媒体原创图文内容制作专家。",
    "根据用户给出的选题、提问或要求，生成一篇可直接发布的原创中文图文。",
    `本次写入飞书车型/关键词: ${vehicleKeyword}。除非用户明确要求更换主体，正文、标题和配图规划都要围绕这个车型/关键词展开。`,
    "只输出严格 JSON，字段为 title, body, imagePrompts, contentTags, aiNotes。",
    "title 是社交媒体标题；body 保留自然段换行；imagePrompts 是数组，每一项是一张配图的独立生成提示词。",
    `配图最多 ${maxOriginalImagePrompts} 张；只有正文确实需要视觉解释、场景展示、信息图或情绪封面时才规划配图；不需要配图时返回空数组。`,
    "每个 imagePrompts 项都必须能独立生成图片，写清主体、构图、风格、画幅和禁止事项，不要引用不存在的本地素材。",
    "不要编造不可验证的事实、价格、配置、销量、政策或时间；联网搜索启用时也要把事实写得克制。",
    `本次文字内容提示词:\n${settings.textInstruction}`,
    `用户素材路径，仅作背景参考，不要泄露路径:\n${materialPaths.join("\n") || "未提供"}`,
    `用户原创 Prompt:\n${prompt}`,
  ].join("\n");
}

function normalizeOriginalPrompt(prompt: string) {
  return typeof prompt === "string" ? prompt.trim() : "";
}

function normalizeOriginalVehicleKeyword(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 96) : "";
}

function stringFromJson(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
}

function normalizeContentTags(value: unknown): ContentTag[] {
  const allowed = new Set<string>(contentTagOptions);
  return arrayOfStrings(value)
    .filter((item) => allowed.has(item))
    .slice(0, 4) as ContentTag[];
}
