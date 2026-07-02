import { compactError, recordExecutionLog } from "./activity-log";
import { appConfig, openaiTextUrl } from "./config";
import { runWithConcurrencyPool } from "./concurrency";
import { formatImageTasksForPrompt, mergeProductionPlan } from "./creation-controls";
import { makeDemoPost } from "./mock-data";
import { buildProductionPlan, formatNonTextProductionConstraintsForPrompt } from "./production-plan";
import {
  clampGeneratedTitleMax,
  countVisibleTitleChars,
  fitTitleLength,
  formatTitleStyleInstruction,
  isGeneratedTitleLengthValid,
  normalizeGeneratedTitle,
  pickTitleLengthProfile,
  type TitleLengthProfile,
} from "./title-guard";
import type { GeneratedPost, NormalizedSourceItem, ProductionPlan, SourceImageTask } from "./types";

type RewriteInput = {
  source: NormalizedSourceItem;
  materialPaths: string[];
  instruction?: string;
  productionPlanOverride?: ProductionPlan;
  imageTasks?: SourceImageTask[];
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
  const productionPlan = mergeProductionPlan(input.source.productionPlan || buildProductionPlan(input.source), input.productionPlanOverride);
  if (productionPlan.decision === "observe_only") {
    throw new Error("该内容被制作策略标记为仅观察，不进入自动生成流程");
  }

  if (!appConfig.openaiApiKey) {
    const demoPost = makeDemoPost(input.source, input.materialPaths);
    return {
      ...demoPost,
      title: clampGeneratedTitleMax(demoPost.title),
    };
  }

  const titleProfile = pickTitleLengthProfile();
  const titleStyleInstruction = formatTitleStyleInstruction(titleProfile);
  const userTextInstruction = input.instruction?.trim() || "基于用户提供的原文信息重写，保留事实主体，重排结构和表达，避免复述原文句式。";
  const prompt = [
    "你是社交媒体图文内容制作专家。不要直接仿写原文，而是提取信息点、爆款表达模型和平台语感后进行原创重构。",
    "文案生产策略完全以用户文案提示词为准；自动识别出的内容方向只用于制作准入、素材需求和图片策略，不得覆盖用户文案提示词。",
    "除非用户文案提示词明确要求切换品牌、车型或视角，否则必须保留原文事实主体，不要因为竞品识别自动改成小鹏、G6 或其他车型。",
    `用户文案提示词:\n${userTextInstruction}`,
    `非文案制作约束:\n${formatNonTextProductionConstraintsForPrompt(productionPlan)}`,
    `用户选择的图片处理任务:\n${formatImageTasksForPrompt(input.imageTasks)}`,
    "如果用户选择了图片任务，imagePrompt 必须只围绕被选中的图片/关键帧展开，不要处理未选中的图片。",
    "如果图片策略是原图引用，必须保留原图作为配图，不要提出洗图或重构要求。",
    "如果图片任务的处理方式是保持原图，该图片会直接使用原图，不需要写入 imagePrompt 的生成要求。",
    "你是社交媒体图文内容制作专家。请学习爆款内容的结构、节奏和视觉策略，但不要复刻原文。",
    "输出严格 JSON，字段为 title, body, imagePrompt, aiNotes。",
    titleStyleInstruction,
    "body 用中文，适合社交媒体图文发布，保留段落换行。",
    `平台: ${input.source.platform}`,
    `原标题: ${input.source.title || ""}`,
    `原内容: ${input.source.contentText || ""}`,
    `数据: ${JSON.stringify(input.source.metrics)}`,
    `用户素材路径: ${input.materialPaths.join(", ") || "未提供"}`,
  ].join("\n");

  const json = await callOpenAIForJson(prompt);
  const body = stringFromJson(json.body, "");
  const rawTitle = stringFromJson(json.title, "未命名图文草稿");
  const title = await repairGeneratedTitleIfNeeded(rawTitle, input, body, titleProfile);

  return {
    id: `post-${input.source.id}-${Date.now()}`,
    sourceItemId: input.source.id,
    platform: input.source.platform,
    title,
    body,
    imagePrompt: stringFromJson(json.imagePrompt, ""),
    imageUrls: [],
    contentTags: input.source.contentTagging?.tags || [],
    productionPlanOverride: productionPlan,
    imageTasks: input.imageTasks,
    materialPaths: input.materialPaths,
    status: "draft",
    aiNotes: arrayOfStrings(json.aiNotes),
    updatedAt: new Date().toISOString(),
  };
}

export async function editPostWithPrompt(input: ReviewEditInput): Promise<GeneratedPost> {
  if (!appConfig.openaiApiKey) {
    return {
      ...input.post,
      title: clampGeneratedTitleMax(input.post.title),
      body: `${input.post.body}\n\n修改备注：${input.instruction}`,
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
    `当前标题: ${input.post.title}`,
    `当前正文: ${input.post.body}`,
    `当前图片提示词: ${input.post.imagePrompt}`,
    `用户指令: ${input.instruction}`,
  ].join("\n");

  const json = await callOpenAIForJson(prompt);

  return {
    ...input.post,
    title: clampGeneratedTitleMax(stringFromJson(json.title, input.post.title)),
    body: stringFromJson(json.body, input.post.body),
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

  const fallback = buildLocalTitleFallback(normalized, input, body, profile);
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

function buildLocalTitleFallback(title: string, input: RewriteInput, body: string, profile: TitleLengthProfile) {
  const context = [title, input.source.title, input.source.contentText, body].filter(Boolean).join("\n");
  const vehicle = extractVehicleName(context);
  const scene = extractTitleScene(context);
  const core = stripWeakTitleWords(title);
  const candidates = [
    core ? `${vehicle}${scene}：${core}` : "",
    `${vehicle}${scene}这次值得细看`,
    `${vehicle}${scene}我认真看完了`,
    `${vehicle}真实体验这次值得聊`,
    `${vehicle}${scene}这些细节比参数更值得聊`,
    `${vehicle}${scene}看完我更在意这些细节`,
  ].filter(Boolean);

  return fitTitleLength(candidates.find((candidate) => isGeneratedTitleLengthValid(candidate, profile)) || candidates[0] || title || "小鹏汽车真实体验值得细聊", profile);
}

function extractVehicleName(text: string) {
  const normalized = text.toLowerCase();
  const patterns: Array<[RegExp, string]> = [
    [/小鹏\s*p7\+?/i, "小鹏P7"],
    [/小鹏\s*x9/i, "小鹏X9"],
    [/小鹏\s*gx/i, "小鹏GX"],
    [/小鹏\s*g9/i, "小鹏G9"],
    [/小鹏\s*g6/i, "小鹏G6"],
    [/p7\+/i, "小鹏P7+"],
    [/\bp7\b/i, "小鹏P7"],
    [/\bx9\b/i, "小鹏X9"],
    [/\bgx\b/i, "小鹏GX"],
    [/\bg9\b/i, "小鹏G9"],
    [/\bg6\b/i, "小鹏G6"],
    [/mona/i, "小鹏MONA"],
  ];
  return patterns.find(([pattern]) => pattern.test(normalized))?.[1] || "小鹏汽车";
}

function extractTitleScene(text: string) {
  if (/试驾|试完|开了|开过|体验/.test(text)) return "试驾体验";
  if (/颜色|车色|丹霞|昆仑|实拍|上镜/.test(text)) return "车色实拍";
  if (/销量|订单|价格|预售|上市|费用/.test(text)) return "价格销量";
  if (/六座|家用|空间|二胎|家庭/.test(text)) return "家用场景";
  if (/配置|版本|Ultra|Max|鹏翼/i.test(text)) return "配置选择";
  return "真实体验";
}

function stripWeakTitleWords(title: string) {
  return title
    .replace(/^这台车?/, "")
    .replace(/^这车/, "")
    .replace(/有点/g, "")
    .replace(/看完了?$/, "")
    .replace(/到了$/, "")
    .replace(/纠结了?$/, "纠结")
    .replace(/\s+/g, "")
    .trim();
}
