import { compactError, recordExecutionLog } from "./activity-log";
import { appConfig, openaiTextUrl } from "./config";
import { concurrencyConfig, mapWithConcurrency, runWithConcurrencyPool } from "./concurrency";
import type {
  NormalizedSourceItem,
  SourceSafetyAssessment,
  SourceSafetyCategory,
  SourceSafetyDecision,
  SourceSafetySeverity,
} from "./types";

type SafetyJson = {
  decision?: unknown;
  categories?: unknown;
  severity?: unknown;
  confidence?: unknown;
  reasons?: unknown;
};

type SafetyFilterContext = {
  scope?: string;
  query?: string;
  runId?: string;
};

type SafetyFilterResult = {
  items: NormalizedSourceItem[];
  filtered: NormalizedSourceItem[];
  reviewed: NormalizedSourceItem[];
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
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

const hardFilterConfidence = 0.8;
const textSliceLength = 2400;

const profanityTerms = [
  "傻逼",
  "sb",
  "垃圾",
  "滚",
  "脑残",
  "废物",
  "去死",
  "妈的",
  "卧槽",
  "我操",
  "艹",
  "操你",
  "草泥马",
  "烂货",
];

const insultTerms = [
  "智商税",
  "割韭菜",
  "黑心",
  "坑爹",
  "丢人",
  "恶心",
  "不配",
  "骗钱",
];

const competitorTerms = [
  "竞品",
  "对手",
  "友商",
  "特斯拉",
  "理想",
  "蔚来",
  "问界",
  "智界",
  "极氪",
  "比亚迪",
  "小米",
  "宝马",
  "奔驰",
  "奥迪",
];

const bashingTerms = [
  "吊打",
  "碾压",
  "秒杀",
  "碰瓷",
  "完爆",
  "不配",
  "垃圾",
  "拉胯",
  "别来沾边",
  "谁买谁傻",
  "智商税",
];

const negativeTerms = [
  "避雷",
  "劝退",
  "后悔",
  "差评",
  "失望",
  "失望透顶",
  "翻车",
  "维权",
  "投诉",
  "故障频发",
  "不推荐",
  "别买",
];

const allowedCategories = new Set<SourceSafetyCategory>([
  "profanity",
  "insult",
  "strong_negative_sentiment",
  "competitor_bashing",
]);

export async function filterUnsafeSourceItems(
  items: NormalizedSourceItem[],
  context: SafetyFilterContext = {},
): Promise<SafetyFilterResult> {
  if (!items.length) return { items, filtered: [], reviewed: [] };

  const assessed = await mapWithConcurrency(items, concurrencyConfig.gpt, async (item) => {
    const safetyAssessment = await assessSourceSafety(item);
    return {
      item: {
        ...item,
        safetyAssessment,
      },
      safetyAssessment,
    };
  });

  const kept = assessed.filter((entry) => entry.safetyAssessment.decision !== "filter").map((entry) => entry.item);
  const filtered = assessed.filter((entry) => entry.safetyAssessment.decision === "filter").map((entry) => entry.item);
  const reviewed = assessed.filter((entry) => entry.safetyAssessment.decision === "review").map((entry) => entry.item);

  if (filtered.length || reviewed.length) {
    await recordExecutionLog({
      scope: context.scope || "source/safety",
      action: "Source safety filtered",
      status: "info",
      message: `内容安全过滤 ${filtered.length} 条，复核标记 ${reviewed.length} 条，保留 ${kept.length} 条`,
      details: {
        query: context.query || null,
        runId: context.runId || null,
        inputCount: items.length,
        kept: kept.length,
        filtered: filtered.length,
        reviewed: reviewed.length,
        categories: summarizeCategories(filtered).join(","),
      },
    });
  }

  return { items: kept, filtered, reviewed };
}

export async function assessSourceSafety(item: NormalizedSourceItem): Promise<SourceSafetyAssessment> {
  const localAssessment = assessSourceSafetyLocally(item);
  if (localAssessment.decision === "filter" && (localAssessment.confidence || 0) >= hardFilterConfidence) {
    return localAssessment;
  }

  if (!appConfig.openaiApiKey) {
    return {
      ...localAssessment,
      status: "skipped",
      error: "OPENAI_API_KEY is not configured",
    };
  }

  try {
    const json = await callSafetyModel(buildSafetyPrompt(item, localAssessment));
    return mergeSafetyAssessments(localAssessment, normalizeModelAssessment(json));
  } catch (error) {
    const message = compactError(error);
    await recordExecutionLog({
      scope: "source/safety",
      action: "Source safety model failed",
      status: "error",
      message,
      details: {
        sourceItemId: item.id,
        model: appConfig.openaiTextModel,
      },
    });
    return {
      ...localAssessment,
      status: "failed",
      model: appConfig.openaiTextModel,
      error: message,
    };
  }
}

function assessSourceSafetyLocally(item: NormalizedSourceItem): SourceSafetyAssessment {
  const text = sourceSafetyText(item);
  const normalized = normalizeText(text);
  const categories = new Set<SourceSafetyCategory>();
  const reasons: string[] = [];

  const profanityHits = findTermHits(normalized, profanityTerms);
  const insultHits = findTermHits(normalized, insultTerms);
  const negativeHits = findTermHits(normalized, negativeTerms);
  const competitorBashing = hasAnyTerm(normalized, competitorTerms) && hasAnyTerm(normalized, bashingTerms);

  if (profanityHits.length) {
    categories.add("profanity");
    reasons.push("命中脏话或粗俗表达");
  }
  if (insultHits.length) {
    categories.add("insult");
    reasons.push("命中辱骂或攻击性表达");
  }
  if (competitorBashing) {
    categories.add("competitor_bashing");
    reasons.push("包含竞品/对手语境下的拉踩表达");
  }
  if (negativeHits.length >= 2) {
    categories.add("strong_negative_sentiment");
    reasons.push("包含多处强负面情绪表达");
  } else if (negativeHits.length === 1) {
    categories.add("strong_negative_sentiment");
    reasons.push("包含负面情绪表达，建议复核");
  }

  const hardFilter =
    categories.has("profanity") ||
    categories.has("insult") ||
    categories.has("competitor_bashing") ||
    negativeHits.length >= 2;
  const decision: SourceSafetyDecision = hardFilter ? "filter" : negativeHits.length ? "review" : "allow";
  const severity: SourceSafetySeverity = hardFilter ? "high" : negativeHits.length ? "medium" : "low";
  const confidence = hardFilter ? 0.88 : negativeHits.length ? 0.55 : 0.25;
  const assessedAt = new Date().toISOString();

  return {
    decision,
    categories: Array.from(categories),
    severity,
    confidence,
    reasons: reasons.slice(0, 4),
    status: "success",
    source: "local",
    assessedAt,
  };
}

function mergeSafetyAssessments(
  localAssessment: SourceSafetyAssessment,
  modelAssessment: SourceSafetyAssessment,
): SourceSafetyAssessment {
  const decision = strongerDecision(modelAssessment.decision, localAssessment.decision);
  const severity = strongerSeverity(modelAssessment.severity, localAssessment.severity);
  return {
    decision,
    categories: mergeCategories(modelAssessment.categories, localAssessment.categories),
    severity,
    confidence: modelAssessment.confidence ?? localAssessment.confidence,
    reasons: [...modelAssessment.reasons, ...localAssessment.reasons].slice(0, 4),
    model: appConfig.openaiTextModel,
    status: "success",
    source: "local_model",
    assessedAt: modelAssessment.assessedAt || localAssessment.assessedAt,
  };
}

function normalizeModelAssessment(json: SafetyJson): SourceSafetyAssessment {
  const decision = normalizeDecision(json.decision);
  const categories = normalizeCategories(json.categories);
  const severity = normalizeSeverity(json.severity);
  const confidence = normalizeConfidence(json.confidence);
  const assessedAt = new Date().toISOString();
  return {
    decision,
    categories,
    severity,
    confidence,
    reasons: arrayOfStrings(json.reasons).slice(0, 4),
    model: appConfig.openaiTextModel,
    status: "success",
    source: "model",
    assessedAt,
  };
}

async function callSafetyModel(prompt: string): Promise<SafetyJson> {
  const text =
    appConfig.openaiTextEndpoint === "chat"
      ? await callChatCompletions(prompt)
      : await callResponsesApi(prompt);
  return parseJsonObject(text) as SafetyJson;
}

async function callResponsesApi(prompt: string) {
  const response = await runWithConcurrencyPool("gpt", () =>
    fetch(openaiTextUrl("responses"), {
      method: "POST",
      headers: openaiHeaders(),
      body: JSON.stringify({
        model: appConfig.openaiTextModel,
        input: prompt,
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
    throw new Error(`OpenAI safety request failed: ${response.status} ${body.slice(0, 260)}`);
  }

  const data = (await response.json()) as ResponsesApiTextResponse;
  return (
    data.output_text ||
    data.output?.flatMap((item) => item.content || []).find((content) => typeof content.text === "string")?.text ||
    "{}"
  );
}

async function callChatCompletions(prompt: string) {
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
    throw new Error(`OpenAI chat safety request failed: ${response.status} ${body.slice(0, 260)}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  return data.choices?.[0]?.message?.content || "{}";
}

function buildSafetyPrompt(item: NormalizedSourceItem, localAssessment: SourceSafetyAssessment) {
  return [
    "你是汽车社媒采集阶段的内容安全审核助手。请判断这条内容是否适合进入后续图文生产池。",
    "重点过滤：脏话、辱骂、人身攻击、强负面情绪、恶意拉踩竞品/对手/友商。",
    "不要误伤客观竞品对比、事实性参数对比、理性用户反馈。只有语气攻击性强、低俗、恶意贬损时才 filter。",
    "decision 只能是 allow、review、filter。",
    "categories 只能从 profanity、insult、strong_negative_sentiment、competitor_bashing 中选择。",
    "severity 只能是 low、medium、high。",
    '输出 JSON：{"decision":"allow","categories":[],"severity":"low","confidence":0.8,"reasons":["理由"]}',
    `本地规则初判: ${localAssessment.decision}; ${localAssessment.categories.join(",") || "none"}; ${localAssessment.reasons.join(" / ") || "none"}`,
    `平台: ${item.platform}`,
    `内容形式: ${item.mediaType || "unknown"}`,
    `标题: ${item.title || ""}`,
    `正文: ${(item.contentText || "").slice(0, textSliceLength)}`,
    `作者: ${item.authorName || ""}`,
    `指标: ${JSON.stringify(item.metrics || {})}`,
  ].join("\n");
}

function sourceSafetyText(item: NormalizedSourceItem) {
  return [item.title, item.contentText, item.authorName].filter(Boolean).join("\n").slice(0, textSliceLength);
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function findTermHits(text: string, terms: string[]) {
  return terms.filter((term) => text.includes(term.toLowerCase().replace(/\s+/g, "")));
}

function hasAnyTerm(text: string, terms: string[]) {
  return findTermHits(text, terms).length > 0;
}

function summarizeCategories(items: NormalizedSourceItem[]) {
  return Array.from(new Set(items.flatMap((item) => item.safetyAssessment?.categories || []))).slice(0, 6);
}

function mergeCategories(...groups: SourceSafetyCategory[][]) {
  return Array.from(new Set(groups.flatMap((group) => group).filter((item) => allowedCategories.has(item))));
}

function normalizeCategories(value: unknown): SourceSafetyCategory[] {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter((item): item is SourceSafetyCategory => allowedCategories.has(item as SourceSafetyCategory)),
        ),
      )
    : [];
}

function normalizeDecision(value: unknown): SourceSafetyDecision {
  return value === "filter" || value === "review" || value === "allow" ? value : "allow";
}

function normalizeSeverity(value: unknown): SourceSafetySeverity {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function normalizeConfidence(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(Math.max(parsed, 0), 1);
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
}

function strongerDecision(first: SourceSafetyDecision, second: SourceSafetyDecision): SourceSafetyDecision {
  const rank: Record<SourceSafetyDecision, number> = {
    allow: 0,
    review: 1,
    filter: 2,
  };
  return rank[first] >= rank[second] ? first : second;
}

function strongerSeverity(first: SourceSafetySeverity, second: SourceSafetySeverity): SourceSafetySeverity {
  const rank: Record<SourceSafetySeverity, number> = {
    low: 0,
    medium: 1,
    high: 2,
  };
  return rank[first] >= rank[second] ? first : second;
}

function openaiHeaders() {
  return {
    Authorization: `Bearer ${appConfig.openaiApiKey}`,
    "Content-Type": "application/json",
  };
}

function parseJsonObject(text: string): Record<string, unknown> {
  const normalized = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(normalized) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
}
