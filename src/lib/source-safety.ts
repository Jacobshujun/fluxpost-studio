import { compactError, recordExecutionLog } from "./activity-log";
import {
  evaluateLocalContentSafety,
  getContentSafetyPolicy,
  normalizeContentSafetyPolicy,
  normalizeContentSafetyPolicySnapshot,
  parseContentSafetyModelOutput,
} from "./content-safety-policy";
import { appConfig, openaiTextUrl } from "./config";
import { concurrencyConfig, mapWithConcurrency, runWithConcurrencyPool } from "./concurrency";
import type { ContentSafetyPolicy, NormalizedSourceItem, SourceSafetyAssessment } from "./types";

export type SafetyFilterContext = {
  scope?: string;
  query?: string;
  runId?: string;
};

export type SafetyFilterResult = {
  items: NormalizedSourceItem[];
  filtered: NormalizedSourceItem[];
  reviewed: NormalizedSourceItem[];
};

type SourceSafetyOptions = {
  forceModel?: boolean;
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

const sourceTextLimit = 5_000;
const safetyModelOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["riskScore", "categoryIds", "reasons"],
  properties: {
    riskScore: { type: "number", minimum: 0, maximum: 100 },
    categoryIds: { type: "array", maxItems: 40, items: { type: "string", maxLength: 64 } },
    reasons: { type: "array", maxItems: 20, items: { type: "string", maxLength: 500 } },
  },
} as const;

export async function filterUnsafeSourceItems(
  items: NormalizedSourceItem[],
  context: SafetyFilterContext = {},
  policyInput?: ContentSafetyPolicy,
): Promise<SafetyFilterResult> {
  if (!items.length) return { items, filtered: [], reviewed: [] };
  const policy = policyInput
    ? normalizeContentSafetyPolicySnapshot(policyInput)
    : await getContentSafetyPolicy();
  const assessed = await mapWithConcurrency(items, concurrencyConfig.gpt, async (item) => {
    const safetyAssessment = await assessSourceSafety(item, policy);
    return {
      item: { ...item, safetyAssessment },
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
      message: `Content safety filtered ${filtered.length}, marked ${reviewed.length} for review, and kept ${kept.length}.`,
      details: {
        runId: context.runId || null,
        policyRevision: policy.revision,
        inputCount: items.length,
        keptCount: kept.length,
        filteredCount: filtered.length,
        reviewedCount: reviewed.length,
        matchedRuleIds: summarizeMatchedRuleIds(assessed.map((entry) => entry.safetyAssessment)).join(","),
        reviewThreshold: policy.model.reviewThreshold,
        filterThreshold: policy.model.filterThreshold,
      },
    });
  }

  return { items: kept, filtered, reviewed };
}

export async function assessSourceSafety(
  item: NormalizedSourceItem,
  policyInput?: ContentSafetyPolicy,
  options: SourceSafetyOptions = {},
): Promise<SourceSafetyAssessment> {
  const policy = policyInput
    ? normalizeContentSafetyPolicySnapshot(policyInput)
    : await getContentSafetyPolicy();
  const localAssessment = evaluateLocalContentSafety(item, policy);
  if (!policy.enabled) return localAssessment;
  if (localAssessment.decision === "filter" && !options.forceModel) return localAssessment;

  const modelEligible = policy.model.enabled && (
    options.forceModel === true ||
    localAssessment.decision === "review" ||
    (localAssessment.decision === "allow" && policy.model.scope === "all_non_filtered")
  );
  if (!modelEligible) return localAssessment;

  if (!appConfig.openaiApiKey) {
    return {
      ...localAssessment,
      status: "skipped",
      error: "OPENAI_API_KEY is not configured",
    };
  }

  try {
    const output = await callSafetyModel(buildSafetyPrompt(item, localAssessment, policy));
    const modelAssessment = parseContentSafetyModelOutput(output, policy);
    return mergeSafetyAssessments(localAssessment, modelAssessment, policy);
  } catch (error) {
    const message = compactError(error);
    await recordExecutionLog({
      scope: "source/safety",
      action: "Source safety model failed",
      status: "error",
      message,
      details: {
        sourceItemId: item.id,
        policyRevision: policy.revision,
        matchedRuleId: localAssessment.matchedRuleId || null,
        model: appConfig.openaiTextModel,
        reviewThreshold: policy.model.reviewThreshold,
        filterThreshold: policy.model.filterThreshold,
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

function mergeSafetyAssessments(
  localAssessment: SourceSafetyAssessment,
  modelAssessment: SourceSafetyAssessment,
  policy: ContentSafetyPolicy,
): SourceSafetyAssessment {
  const localFilterIsFinal = localAssessment.decision === "filter";
  return {
    ...modelAssessment,
    decision: localFilterIsFinal ? "filter" : modelAssessment.decision,
    severity: localFilterIsFinal ? "high" : modelAssessment.severity,
    categories: Array.from(new Set([...localAssessment.categories, ...modelAssessment.categories])),
    reasons: [...modelAssessment.reasons, ...localAssessment.reasons].slice(0, 8),
    model: appConfig.openaiTextModel,
    status: "success",
    source: "local_model",
    assessedAt: modelAssessment.assessedAt || localAssessment.assessedAt,
    matchedRuleId: localAssessment.matchedRuleId,
    policyRevision: policy.revision,
  };
}

async function callSafetyModel(prompt: string) {
  return appConfig.openaiTextEndpoint === "chat"
    ? callChatCompletions(prompt)
    : callResponsesApi(prompt);
}

async function callResponsesApi(prompt: string) {
  const response = await runWithConcurrencyPool("gpt", () =>
    fetch(openaiTextUrl("responses"), {
      method: "POST",
      headers: openaiHeaders(),
      body: JSON.stringify({
        model: appConfig.openaiTextModel,
        input: prompt,
        text: { format: { type: "json_object" } },
      }),
    }),
  );
  if (!response.ok) {
    throw new Error(`OpenAI safety request failed with status ${response.status}.`);
  }
  const data = (await response.json()) as ResponsesApiTextResponse;
  return data.output_text || data.output?.flatMap((item) => item.content || [])
    .find((content) => typeof content.text === "string")?.text || "";
}

async function callChatCompletions(prompt: string) {
  const response = await runWithConcurrencyPool("gpt", () =>
    fetch(openaiTextUrl("chat/completions"), {
      method: "POST",
      headers: openaiHeaders(),
      body: JSON.stringify({
        model: appConfig.openaiTextModel,
        messages: [
          { role: "system", content: "Return one valid JSON object only. Do not use Markdown." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    }),
  );
  if (!response.ok) {
    throw new Error(`OpenAI chat safety request failed with status ${response.status}.`);
  }
  const data = (await response.json()) as ChatCompletionResponse;
  return data.choices?.[0]?.message?.content || "";
}

function buildSafetyPrompt(
  item: NormalizedSourceItem,
  localAssessment: SourceSafetyAssessment,
  policy: ContentSafetyPolicy,
) {
  const categoryAppendix = policy.categories.map((category) => ({
    id: category.id,
    label: category.label,
    description: category.description || "",
  }));
  return [
    policy.model.prompt,
    "",
    "IMMUTABLE OUTPUT CONTRACT:",
    "Return exactly one JSON object with riskScore (number from 0 through 100), categoryIds (array of configured ids), and reasons (array of concise strings).",
    `JSON Schema: ${JSON.stringify(safetyModelOutputSchema)}`,
    `Configured categories: ${JSON.stringify(categoryAppendix)}`,
    `Thresholds: allow below ${policy.model.reviewThreshold}; review from ${policy.model.reviewThreshold} to below ${policy.model.filterThreshold}; filter at ${policy.model.filterThreshold} or above.`,
    `Local result: ${JSON.stringify({ decision: localAssessment.decision, categoryIds: localAssessment.categories, matchedRuleId: localAssessment.matchedRuleId || null })}`,
    "",
    "CONTENT TO REVIEW:",
    JSON.stringify({
      platform: item.platform,
      mediaType: item.mediaType || "unknown",
      title: (item.title || "").slice(0, sourceTextLimit),
      body: (item.contentText || "").slice(0, sourceTextLimit),
      author: (item.authorName || "").slice(0, sourceTextLimit),
    }),
  ].join("\n");
}

function summarizeMatchedRuleIds(assessments: SourceSafetyAssessment[]) {
  return Array.from(new Set(assessments.map((assessment) => assessment.matchedRuleId).filter(Boolean))).slice(0, 12);
}

function openaiHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${appConfig.openaiApiKey}`,
  };
}

export function validateContentSafetyPolicyForRuntime(policy: unknown) {
  return normalizeContentSafetyPolicy(policy);
}
