import { compactError, recordExecutionLog } from "./activity-log";
import { appConfig, openaiTextUrl } from "./config";
import { runWithConcurrencyPool } from "./concurrency";
import { formatImageTasksForPrompt } from "./creation-controls";
import {
  FINISHED_BODY_MAX_CHARS,
  FINISHED_BODY_POLICY_VERSION,
  FINISHED_BODY_TARGET_CHARS,
  FINISHED_BODY_TARGET_INSTRUCTION,
  countFinishedBodyChars,
  truncateFinishedBody,
} from "./finished-body-policy";
import { makeDemoPost } from "./mock-data";
import { toModelImageUrl } from "./model-image-input";
import { resolveSourceVideoUrls } from "./source-video-reference";
import {
  clampGeneratedTitleMax,
  countVisibleTitleChars,
  formatTitleStyleInstruction,
  isGeneratedTitleLengthValid,
  normalizeGeneratedTitle,
  pickTitleLengthProfile,
  type TitleLengthProfile,
} from "./title-guard";
import type { GeneratedPost, NormalizedSourceItem, SourceImageTask } from "./types";

type RewriteInput = {
  source: NormalizedSourceItem;
  materialPaths: string[];
  instruction?: string;
  imageTasks?: SourceImageTask[];
  includeSourceVideo?: boolean;
};

type ReviewEditInput = {
  post: GeneratedPost;
  instruction: string;
};

type ResponsesApiTextResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type JsonModelOptions = {
  webSearch?: boolean;
  logLabel?: string;
};

export async function generatePost(input: RewriteInput): Promise<GeneratedPost> {
  const sourceTitle = normalizeSourceText(input.source.title);
  const sourceBody = normalizeSourceText(input.source.contentText);
  const hasSourceTitle = Boolean(sourceTitle);
  const hasSourceBody = Boolean(sourceBody);
  if (!appConfig.openaiApiKey) {
    const source = input.source;
    const demoPost = makeDemoPost(input.source, input.materialPaths);
    return {
      ...demoPost,
      body: truncateFinishedBody(demoPost.body),
      bodyPolicyVersion: FINISHED_BODY_POLICY_VERSION,
      videoUrls: input.includeSourceVideo === true ? resolveSourceVideoUrls(source) : [],
      title: clampGeneratedTitleMax(demoPost.title, ""),
      imageTasks: input.imageTasks,
    };
  }

  if (!hasSourceTitle && !hasSourceBody) {
    return buildTextlessDraft(input);
  }

  const titleProfile = pickTitleLengthProfile();
  const titleStyleInstruction = formatTitleStyleInstruction(titleProfile);
  const userTextInstruction = input.instruction?.trim() || "基于用户提供的原文信息重写，保留事实主体，重排结构和表达，避免复述原文句式。";
  const prompt = [
    "你是社交媒体图文内容制作专家。不要直接仿写原文，而是提取信息点、爆款表达模型和平台语感后进行原创重构。",
    "文案生产策略完全以用户文案提示词为准，不要自行添加行业、竞品、品牌或车型转换策略。",
    "除非用户文案提示词明确要求切换品牌、车型或视角，否则必须保留原文事实主体。",
    `用户文案提示词:\n${userTextInstruction}`,
    `用户选择的图片处理任务:\n${formatImageTasksForPrompt(input.imageTasks)}`,
    "如果用户选择了图片任务，imagePrompt 必须只围绕被选中的图片/关键帧展开，不要处理未选中的图片。",
    "如果图片策略是原图引用，必须保留原图作为配图，不要提出洗图或重构要求。",
    "如果图片任务的处理方式是保持原图，该图片会直接使用原图，不需要写入 imagePrompt 的生成要求。",
    "你是社交媒体图文内容制作专家。请学习爆款内容的结构、节奏和视觉策略，但不要复刻原文。",
    "输出严格 JSON，字段为 title, body, imagePrompt, aiNotes。",
    hasSourceTitle ? titleStyleInstruction : "源内容没有可确认的标题，title 必须返回空字符串，不要从正文、关键词或车型元数据编造标题。",
    hasSourceBody ? "body 用中文，适合社交媒体图文发布，保留段落换行；原文较短时保持相应长度，不要为了达到字数补造事实。" : "源内容没有可确认的正文，body 必须返回空字符串，不要根据标题、图片或车型元数据编造正文。",
    hasSourceBody ? FINISHED_BODY_TARGET_INSTRUCTION : "",
    "任务关键词/车型字段仅是元数据，不是普通改写的内容上下文；只有原始文本或用户提示词明确提及时才可使用。",
    `平台: ${input.source.platform}`,
    `原标题: ${sourceTitle}`,
    `原内容: ${sourceBody}`,
    `数据: ${JSON.stringify(input.source.metrics)}`,
    `用户素材路径: ${input.materialPaths.join(", ") || "未提供"}`,
  ].join("\n");

  const json = await callOpenAIForJson(prompt);
  const body = hasSourceBody
    ? await finalizeAiFinishedBody(stringFromJson(json.body, sourceBody), {
        context: `平台: ${input.source.platform}\n原标题: ${sourceTitle}`,
        logLabel: "生成正文压缩",
      })
    : "";
  const rawTitle = hasSourceTitle ? stringFromJson(json.title, sourceTitle) : "";
  const title = hasSourceTitle ? await repairGeneratedTitleIfNeeded(rawTitle, input, body, titleProfile) : "";

  return {
    id: `post-${input.source.id}-${Date.now()}`,
    sourceItemId: input.source.id,
    platform: input.source.platform,
    title,
    body,
    bodyPolicyVersion: FINISHED_BODY_POLICY_VERSION,
    imagePrompt: stringFromJson(json.imagePrompt, ""),
    imageUrls: [],
    videoUrls: input.includeSourceVideo === true ? resolveSourceVideoUrls(input.source) : [],
    contentTags: input.source.contentTagging?.tags || [],
    imageTasks: input.imageTasks,
    materialPaths: input.materialPaths,
    status: "draft",
    aiNotes: [
      ...arrayOfStrings(json.aiNotes),
      ...buildMissingSourceTextNotes(hasSourceTitle, hasSourceBody),
    ],
    updatedAt: new Date().toISOString(),
  };
}

function buildTextlessDraft(input: RewriteInput): GeneratedPost {
  const source = input.source;
  return {
    id: `post-${source.id}-${Date.now()}`,
    sourceItemId: source.id,
    platform: source.platform,
    title: "",
    body: "",
    bodyPolicyVersion: FINISHED_BODY_POLICY_VERSION,
    imagePrompt: "",
    imageUrls: [],
    videoUrls: input.includeSourceVideo === true ? resolveSourceVideoUrls(source) : [],
    contentTags: source.contentTagging?.tags || [],
    imageTasks: input.imageTasks,
    materialPaths: input.materialPaths,
    status: "draft",
    aiNotes: ["采集内容缺少可确认的标题和正文，请先补充文字后再生成。"],
    updatedAt: new Date().toISOString(),
  };
}

function buildMissingSourceTextNotes(hasTitle: boolean, hasBody: boolean) {
  if (hasTitle && hasBody) return [];
  return [hasTitle ? "采集内容没有可确认的正文，已保留正文为空。" : "采集内容没有可确认的标题，已保留标题为空。"];
}

export async function editPostWithPrompt(input: ReviewEditInput): Promise<GeneratedPost> {
  if (!appConfig.openaiApiKey) {
    const body = truncateFinishedBody(`${input.post.body}\n\n修改备注：${input.instruction}`);
    return {
      ...input.post,
      title: clampGeneratedTitleMax(input.post.title, ""),
      body,
      bodyPolicyVersion: FINISHED_BODY_POLICY_VERSION,
      aiNotes: [...input.post.aiNotes, "当前为未配置 OpenAI API Key 时的本地编辑回显。"],
      status: "editing",
      updatedAt: new Date().toISOString(),
    };
  }

  const titleProfile = pickTitleLengthProfile();
  const prompt = [
    "你是社交媒体图文审稿编辑。请根据用户指令修改草稿，保持可发布状态。",
    "输出严格 JSON，字段为 title, body, imagePrompt, aiNotes。",
    formatTitleStyleInstruction(titleProfile),
    FINISHED_BODY_TARGET_INSTRUCTION,
    `当前标题: ${input.post.title}`,
    `当前正文: ${input.post.body}`,
    `当前图片提示词: ${input.post.imagePrompt}`,
    `用户指令: ${input.instruction}`,
  ].join("\n");

  const json = await callOpenAIForJson(prompt);

  const body = await finalizeAiFinishedBody(stringFromJson(json.body, input.post.body), {
    context: `当前标题: ${input.post.title}\n用户指令: ${input.instruction}`,
    logLabel: "审查正文压缩",
  });
  return {
    ...input.post,
    title: clampGeneratedTitleMax(stringFromJson(json.title, input.post.title), ""),
    body,
    bodyPolicyVersion: FINISHED_BODY_POLICY_VERSION,
    imagePrompt: stringFromJson(json.imagePrompt, input.post.imagePrompt),
    aiNotes: arrayOfStrings(json.aiNotes),
    status: "editing",
    updatedAt: new Date().toISOString(),
  };
}

export async function callOpenAIForJson(prompt: string, options: JsonModelOptions = {}): Promise<Record<string, unknown>> {
  const text =
    appConfig.openaiTextEndpoint === "chat"
      ? await callChatCompletions(prompt, options)
      : await callResponsesApi(prompt, options);

  return parseJsonObject(text);
}

export async function callOpenAIForText(prompt: string, options: JsonModelOptions = {}) {
  if (!appConfig.openaiApiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const result = await callOpenAIForJson(
    `${prompt}\n\nReturn a JSON object with one string field named text. Do not omit the field.`,
    options,
  );
  const text = typeof result.text === "string" ? result.text.trim() : "";
  if (!text) throw new Error("The text model returned an empty response.");
  return text;
}

export async function finalizeAiFinishedBody(
  value: string,
  options: { context?: string; logLabel?: string } = {},
) {
  const normalized = value.trim();
  if (countFinishedBodyChars(normalized) <= FINISHED_BODY_MAX_CHARS) return normalized;

  try {
    const json = await callOpenAIForJson([
      "你是社交媒体正文压缩编辑。只压缩正文，不新增事实，不改变车型、参数、结论或立场。",
      `将正文压缩到约 ${FINISHED_BODY_TARGET_CHARS} 个字符，绝对不得超过 ${FINISHED_BODY_MAX_CHARS} 个字符。`,
      "保留自然段落和完整句子，只输出严格 JSON，字段为 body。",
      options.context?.trim() || "",
      `待压缩正文:\n${normalized}`,
    ].filter(Boolean).join("\n"), { logLabel: options.logLabel || "正文超限压缩" });
    const repaired = stringFromJson(json.body, "");
    if (repaired) return truncateFinishedBody(repaired);
  } catch (error) {
    await recordExecutionLog({
      scope: "openai/text",
      action: "Finished body repair fallback used",
      status: "info",
      message: compactError(error),
      details: { originalBodyChars: countFinishedBodyChars(normalized) },
    });
  }

  return truncateFinishedBody(normalized);
}

export async function callOpenAIForVisionText(prompt: string, imageUrls: string[], options: JsonModelOptions = {}) {
  if (!appConfig.openaiApiKey) throw new Error("OPENAI_API_KEY is not configured.");
  if (!prompt.trim()) throw new Error("Vision prompt cannot be empty.");
  if (!imageUrls.length || imageUrls.length > 8) throw new Error("Vision requests require 1 to 8 images.");
  const prepared = await Promise.all(imageUrls.map(async (url) => {
    const imageUrl = await toModelImageUrl(url);
    if (!imageUrl) throw new Error(`Unsupported vision image URL: ${url}`);
    return imageUrl;
  }));
  const startedAt = Date.now();
  await recordExecutionLog({
    scope: "openai/vision",
    action: "Request vision text model",
    status: "running",
    message: options.logLabel || "Preparing canvas vision request",
    details: { model: appConfig.openaiTextModel, imageCount: prepared.length, promptLength: prompt.length },
  });
  const endpoint = appConfig.openaiTextEndpoint === "chat" ? "chat/completions" : "responses";
  const response = await runWithConcurrencyPool("gpt", () => fetch(openaiTextUrl(endpoint), {
    method: "POST",
    headers: openaiHeaders(),
    body: JSON.stringify(appConfig.openaiTextEndpoint === "chat"
      ? {
          model: appConfig.openaiTextModel,
          messages: [{ role: "user", content: [
            { type: "text", text: prompt },
            ...prepared.map((imageUrl) => ({ type: "image_url", image_url: { url: imageUrl } })),
          ] }],
        }
      : {
          model: appConfig.openaiTextModel,
          input: [{ role: "user", content: [
            { type: "input_text", text: prompt },
            ...prepared.map((imageUrl) => ({ type: "input_image", image_url: imageUrl })),
          ] }],
        }),
  }));
  if (!response.ok) {
    const body = await response.text();
    const message = compactError(`OpenAI vision request failed: ${response.status} ${body.slice(0, 260)}`);
    await recordExecutionLog({ scope: "openai/vision", action: "Vision text model failed", status: "error", message, durationMs: Date.now() - startedAt });
    throw new Error(message);
  }
  const data = (await response.json()) as ResponsesApiTextResponse & ChatCompletionResponse;
  const text = appConfig.openaiTextEndpoint === "chat"
    ? data.choices?.[0]?.message?.content?.trim()
    : (data.output_text || data.output?.flatMap((item) => item.content || []).find((content) => typeof content.text === "string")?.text)?.trim();
  if (!text) throw new Error("The vision model returned an empty response.");
  await recordExecutionLog({
    scope: "openai/vision",
    action: "Vision text model completed",
    status: "success",
    message: "Canvas vision analysis completed",
    durationMs: Date.now() - startedAt,
    details: { model: appConfig.openaiTextModel, imageCount: prepared.length },
  });
  return text;
}

async function callResponsesApi(prompt: string, options: JsonModelOptions = {}) {
  const startedAt = Date.now();
  const webSearch = options.webSearch === true;
  await recordExecutionLog({
    scope: "openai/text",
    action: "请求 Responses 文本模型",
    status: "running",
    message: options.logLabel || "准备发送图文生成/编辑 Prompt",
    details: {
      model: appConfig.openaiTextModel,
      promptLength: prompt.length,
      webSearch,
    },
  });
  const response = await runWithConcurrencyPool("gpt", () =>
    fetch(openaiTextUrl("responses"), {
      method: "POST",
      headers: openaiHeaders(),
      body: JSON.stringify({
        model: appConfig.openaiTextModel,
        input: prompt,
        ...(webSearch
          ? {
              tools: [{ type: "web_search" }],
              tool_choice: { type: "web_search" },
            }
          : {}),
        text: {
          format: {
            type: "json_object",
          },
        },
      }),
    }),
  );

  if (!response.ok) {
    const body = await response.text();
    await recordExecutionLog({
      scope: "openai/text",
      action: "Responses 文本模型失败",
      status: "error",
      message: compactError(`OpenAI request failed: ${response.status} ${body.slice(0, 260)}`),
      durationMs: Date.now() - startedAt,
      details: {
        status: response.status,
        model: appConfig.openaiTextModel,
        webSearch,
      },
    });
    throw new Error(`OpenAI request failed: ${response.status} ${body.slice(0, 260)}`);
  }

  const data = (await response.json()) as ResponsesApiTextResponse;
  await recordExecutionLog({
    scope: "openai/text",
    action: "Responses 文本模型完成",
    status: "success",
    message: "模型已返回文本结果，准备解析 JSON",
    durationMs: Date.now() - startedAt,
    details: {
      status: response.status,
      model: appConfig.openaiTextModel,
      webSearch,
    },
  });
  return (
    data.output_text ||
    data.output?.flatMap((item) => item.content || []).find((content) => typeof content.text === "string")?.text ||
    "{}"
  );
}

async function callChatCompletions(prompt: string, options: JsonModelOptions = {}) {
  if (options.webSearch === true) {
    throw new Error("Original-mode web search requires OPENAI_TEXT_ENDPOINT=responses; Chat Completions does not support the web_search tool.");
  }
  const startedAt = Date.now();
  await recordExecutionLog({
    scope: "openai/text",
    action: "请求 Chat 文本模型",
    status: "running",
    message: "准备发送图文生成/编辑 Prompt",
    details: {
      model: appConfig.openaiTextModel,
      promptLength: prompt.length,
    },
  });
  const response = await runWithConcurrencyPool("gpt", () =>
    fetch(openaiTextUrl("chat/completions"), {
      method: "POST",
      headers: openaiHeaders(),
      body: JSON.stringify({
        model: appConfig.openaiTextModel,
        messages: [
        {
          role: "system",
          content: "你只输出合法 JSON，不要输出 Markdown。",
        },
        {
          role: "user",
          content: prompt,
        },
        ],
        response_format: {
          type: "json_object",
        },
      }),
    }),
  );

  if (!response.ok) {
    const body = await response.text();
    await recordExecutionLog({
      scope: "openai/text",
      action: "Chat 文本模型失败",
      status: "error",
      message: compactError(`OpenAI chat request failed: ${response.status} ${body.slice(0, 260)}`),
      durationMs: Date.now() - startedAt,
      details: {
        status: response.status,
        model: appConfig.openaiTextModel,
      },
    });
    throw new Error(`OpenAI chat request failed: ${response.status} ${body.slice(0, 260)}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  await recordExecutionLog({
    scope: "openai/text",
    action: "Chat 文本模型完成",
    status: "success",
    message: "模型已返回文本结果，准备解析 JSON",
    durationMs: Date.now() - startedAt,
    details: {
      status: response.status,
      model: appConfig.openaiTextModel,
    },
  });
  return data.choices?.[0]?.message?.content || "{}";
}

export function openaiHeaders() {
  return {
    Authorization: `Bearer ${appConfig.openaiApiKey}`,
    "Content-Type": "application/json",
  };
}

function parseJsonObject(text: string): Record<string, unknown> {
  const normalized = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(normalized) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  return parsed as Record<string, unknown>;
}

function stringFromJson(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function repairGeneratedTitleIfNeeded(title: string, input: RewriteInput, body: string, profile: TitleLengthProfile) {
  const normalized = normalizeGeneratedTitle(title);
  if (isGeneratedTitleLengthValid(normalized, profile)) return normalized;

  try {
    const json = await callOpenAIForJson(
      [
        "你是社交媒体标题编辑，只修正 title，不改正文。",
        formatTitleStyleInstruction(profile),
        "只输出严格 JSON，字段为 title。",
        `当前不合格标题: ${normalized}`,
        `当前标题长度: ${countVisibleTitleChars(normalized)}`,
        `本次标题档位: ${profile.label} ${profile.min}-${profile.max} 个可见字符`,
        `平台: ${input.source.platform}`,
        `原标题: ${input.source.title || ""}`,
        `原内容: ${input.source.contentText || ""}`,
        `已生成正文: ${body}`,
        `用户额外要求: ${input.instruction || "无"}`,
      ].join("\n"),
    );
    const repaired = normalizeGeneratedTitle(stringFromJson(json.title, ""));
    if (isGeneratedTitleLengthValid(repaired, profile)) {
      return repaired;
    }
  } catch (error) {
    await recordExecutionLog({
      scope: "openai/text",
      action: "Title repair fallback used",
      status: "info",
      message: compactError(error),
      details: {
        sourceItemId: input.source.id,
        titleChars: countVisibleTitleChars(normalized),
        titleLengthProfile: profile.label,
        targetTitleRange: `${profile.min}-${profile.max}`,
      },
    });
  }

  const fallback = buildLocalTitleFallback(normalized);
  await recordExecutionLog({
    scope: "openai/text",
    action: "Generated title normalized",
    status: "info",
    message: "Generated title did not meet the randomized title-length profile and was normalized locally.",
    details: {
      sourceItemId: input.source.id,
      originalTitleChars: countVisibleTitleChars(normalized),
      finalTitleChars: countVisibleTitleChars(fallback),
      titleLengthProfile: profile.label,
      targetTitleRange: `${profile.min}-${profile.max}`,
    },
  });
  return fallback;
}

function buildLocalTitleFallback(title: string) {
  return clampGeneratedTitleMax(title, "");
}

function normalizeSourceText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
