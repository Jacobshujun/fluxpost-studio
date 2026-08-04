import { recordExecutionLog } from "./activity-log";
import { compareAndSetAppMetaValue, readAppMetaValue } from "./database";
import type {
  ContentSafetyPolicy,
  ContentSafetyPolicyCategory,
  ContentSafetyPolicyConditionGroup,
  ContentSafetyPolicyField,
  ContentSafetyPolicyRule,
  NormalizedSourceItem,
  SourceSafetyAssessment,
  SourceSafetyDecision,
  SourceSafetySeverity,
  WorkspaceAccount,
} from "./types";

const policyStorageKey = "content_safety_policy_v1";
const maxCategories = 40;
const maxRules = 100;
const maxGroupsPerRule = 12;
const maxTermsPerGroup = 40;
const maxIdLength = 64;
const maxLabelLength = 120;
const maxDescriptionLength = 500;
const maxTermLength = 120;
const maxPromptLength = 20_000;
const maxModelOutputLength = 64 * 1024;
const maxModelReasons = 20;
const maxPersistedPolicyBytes = 256 * 1024;
const allowedFields = new Set<ContentSafetyPolicyField>(["title", "body", "author"]);
const allowedActions = new Set<SourceSafetyDecision>(["allow", "review", "filter"]);

const shippedPolicy: ContentSafetyPolicy = {
  schemaVersion: 1,
  revision: 0,
  enabled: true,
  categories: [
    { id: "profanity", label: "Profanity" },
    { id: "insult", label: "Insult or personal attack" },
    { id: "strong_negative_sentiment", label: "Strong negative sentiment" },
    { id: "competitor_bashing", label: "Malicious competitor bashing" },
  ],
  local: {
    enabled: true,
    rules: [
      {
        id: "explicit-profanity",
        name: "Explicit profanity",
        enabled: true,
        action: "filter",
        categoryIds: ["profanity"],
        groups: [{
          fields: ["title", "body", "author"],
          mode: "any",
          terms: ["傻逼", "sb", "垃圾", "滚", "滚出", "脑残", "废物", "去死", "妈的", "卧槽", "我操", "艹", "操你", "草泥马", "烂货"],
        }],
      },
      {
        id: "explicit-insult",
        name: "Explicit personal attack",
        enabled: true,
        action: "filter",
        categoryIds: ["insult"],
        groups: [{
          fields: ["title", "body", "author"],
          mode: "any",
          terms: ["智商税", "割韭菜", "黑心", "坑爹", "丢人", "恶心", "不配", "骗钱", "骗子"],
        }],
      },
      {
        id: "negative-cluster",
        name: "Repeated strong negative sentiment",
        enabled: true,
        action: "filter",
        categoryIds: ["strong_negative_sentiment"],
        groups: [{
          fields: ["title", "body"],
          mode: "at_least",
          atLeast: 2,
          terms: ["避雷", "劝退", "后悔", "差评", "失望", "失望透顶", "翻车", "维权", "投诉", "故障频发", "不推荐", "别买"],
        }],
      },
      {
        id: "competitor-strong-comparison",
        name: "Strong competitor comparison",
        enabled: true,
        action: "review",
        categoryIds: ["competitor_bashing"],
        groups: [
          {
            fields: ["title", "body"],
            mode: "any",
            terms: ["竞品", "对手", "友商", "特斯拉", "理想", "蔚来", "问界", "智界", "极氪", "比亚迪", "小米", "宝马", "奔驰", "奥迪"],
          },
          {
            fields: ["title", "body"],
            mode: "any",
            terms: ["吊打", "碾压", "秒杀", "碰瓷", "完爆", "拉胯", "别来沾边", "谁买谁傻"],
          },
        ],
      },
      {
        id: "negative-review",
        name: "Single strong negative signal",
        enabled: true,
        action: "review",
        categoryIds: ["strong_negative_sentiment"],
        groups: [{
          fields: ["title", "body"],
          mode: "any",
          terms: ["避雷", "劝退", "后悔", "差评", "失望", "失望透顶", "翻车", "维权", "投诉", "故障频发", "不推荐", "别买"],
        }],
      },
    ],
  },
  model: {
    enabled: true,
    scope: "all_non_filtered",
    prompt: "Review the source content for profanity, insults, personal attacks, strongly hostile sentiment, and malicious competitor bashing. Objective comparisons and factual criticism are allowed.",
    reviewThreshold: 40,
    filterThreshold: 80,
  },
};

export const defaultContentSafetyPolicy = clonePolicy(shippedPolicy);

export class ContentSafetyPolicyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentSafetyPolicyValidationError";
  }
}

export class ContentSafetyPolicyConflictError extends Error {
  readonly currentRevision: number;

  constructor(currentRevision: number) {
    super(`Content safety policy revision conflict; current revision is ${currentRevision}.`);
    this.name = "ContentSafetyPolicyConflictError";
    this.currentRevision = currentRevision;
  }
}

export function createDefaultContentSafetyPolicy() {
  return clonePolicy(shippedPolicy);
}

export function normalizeContentSafetyPolicy(value: unknown): ContentSafetyPolicy {
  const input = requireRecord(value, "Policy must be an object.");
  if (input.schemaVersion !== 1) throw validationError("schemaVersion must be 1.");
  const revision = requireInteger(input.revision, "revision", 0, Number.MAX_SAFE_INTEGER);
  const enabled = requireBoolean(input.enabled, "enabled");
  const categories = normalizeCategories(input.categories);
  const categoryIds = new Set(categories.map((category) => category.id));
  const localInput = requireRecord(input.local, "local must be an object.");
  const modelInput = requireRecord(input.model, "model must be an object.");
  const local = {
    enabled: requireBoolean(localInput.enabled, "local.enabled"),
    rules: normalizeRules(localInput.rules, categoryIds),
  };
  const reviewThreshold = requireFiniteNumber(modelInput.reviewThreshold, "model.reviewThreshold", 0, 100);
  const filterThreshold = requireFiniteNumber(modelInput.filterThreshold, "model.filterThreshold", 0, 100);
  if (reviewThreshold >= filterThreshold) throw validationError("model.reviewThreshold must be less than model.filterThreshold.");
  const scope = modelInput.scope;
  if (scope !== "local_review" && scope !== "all_non_filtered") {
    throw validationError("model.scope must be local_review or all_non_filtered.");
  }
  const prompt = requireString(modelInput.prompt, "model.prompt", maxPromptLength, true);
  const modelEnabled = requireBoolean(modelInput.enabled, "model.enabled");
  if (modelEnabled && !prompt) throw validationError("model.prompt is required when model review is enabled.");

  const policy: ContentSafetyPolicy = {
    schemaVersion: 1,
    revision,
    enabled,
    categories,
    local,
    model: {
      enabled: modelEnabled,
      scope,
      prompt,
      reviewThreshold,
      filterThreshold,
    },
  };
  if (input.updatedAt !== undefined) policy.updatedAt = requireIsoDate(input.updatedAt, "updatedAt");
  if (input.updatedBy !== undefined) {
    const actor = requireRecord(input.updatedBy, "updatedBy must be an object.");
    policy.updatedBy = {
      id: requireString(actor.id, "updatedBy.id", maxLabelLength),
      displayName: requireString(actor.displayName, "updatedBy.displayName", maxLabelLength),
    };
  }
  if (Buffer.byteLength(JSON.stringify(policy), "utf8") > maxPersistedPolicyBytes) {
    throw validationError(`Policy must be at most ${maxPersistedPolicyBytes} bytes.`);
  }
  return policy;
}

export function normalizeContentSafetyPolicySnapshot(policy?: ContentSafetyPolicy) {
  if (!policy) return createDefaultContentSafetyPolicy();
  try {
    return normalizeContentSafetyPolicy(policy);
  } catch {
    return createDefaultContentSafetyPolicy();
  }
}

export async function getContentSafetyPolicy() {
  const stored = await readAppMetaValue(policyStorageKey);
  if (!stored) return createDefaultContentSafetyPolicy();
  try {
    return normalizeContentSafetyPolicy(JSON.parse(stored));
  } catch {
    return createDefaultContentSafetyPolicy();
  }
}

export async function saveContentSafetyPolicy(
  input: unknown,
  expectedRevision: number,
  actor: Pick<WorkspaceAccount, "id" | "displayName">,
) {
  const stored = await readAppMetaValue(policyStorageKey);
  const current = parseStoredPolicy(stored);
  assertExpectedRevision(expectedRevision, current.revision);
  const normalized = normalizeContentSafetyPolicy(input);
  const policy: ContentSafetyPolicy = {
    ...normalized,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: { id: actor.id, displayName: actor.displayName },
  };
  if (!await compareAndSetAppMetaValue(policyStorageKey, stored, JSON.stringify(policy))) {
    throw new ContentSafetyPolicyConflictError((await getContentSafetyPolicy()).revision);
  }
  await recordPolicyAudit("Content safety policy saved", policy, actor);
  return policy;
}

export async function resetContentSafetyPolicy(
  expectedRevision: number,
  actor: Pick<WorkspaceAccount, "id" | "displayName">,
) {
  const stored = await readAppMetaValue(policyStorageKey);
  const current = parseStoredPolicy(stored);
  assertExpectedRevision(expectedRevision, current.revision);
  const policy: ContentSafetyPolicy = {
    ...createDefaultContentSafetyPolicy(),
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: { id: actor.id, displayName: actor.displayName },
  };
  if (!await compareAndSetAppMetaValue(policyStorageKey, stored, JSON.stringify(policy))) {
    throw new ContentSafetyPolicyConflictError((await getContentSafetyPolicy()).revision);
  }
  await recordPolicyAudit("Content safety policy reset", policy, actor);
  return policy;
}

export function evaluateLocalContentSafety(
  item: Pick<NormalizedSourceItem, "title" | "contentText" | "authorName">,
  policyInput: ContentSafetyPolicy,
): SourceSafetyAssessment {
  const policy = normalizeContentSafetyPolicy(policyInput);
  const assessedAt = new Date().toISOString();
  if (!policy.enabled) return baseAssessment("allow", "local", policy.revision, assessedAt);
  if (!policy.local.enabled) return baseAssessment("allow", "local", policy.revision, assessedAt);

  const fields: Record<ContentSafetyPolicyField, string> = {
    title: normalizeMatchText(item.title || ""),
    body: normalizeMatchText(item.contentText || ""),
    author: normalizeMatchText(item.authorName || ""),
  };
  const rule = policy.local.rules.find((candidate) => candidate.enabled && candidate.groups.every((group) => groupMatches(group, fields)));
  if (!rule) return baseAssessment("allow", "local", policy.revision, assessedAt);
  return {
    ...baseAssessment(rule.action, "local", policy.revision, assessedAt),
    categories: [...rule.categoryIds],
    reasons: [`Matched local rule: ${rule.name}`],
    matchedRuleId: rule.id,
  };
}

export function parseContentSafetyModelOutput(output: string | unknown, policyInput: ContentSafetyPolicy): SourceSafetyAssessment {
  const policy = normalizeContentSafetyPolicy(policyInput);
  let parsed: unknown = output;
  if (typeof output === "string") {
    if (output.length > maxModelOutputLength) throw validationError(`Model output must be at most ${maxModelOutputLength} characters.`);
    try {
      parsed = JSON.parse(output);
    } catch {
      throw validationError("Model output must be valid JSON.");
    }
  }
  const value = requireRecord(parsed, "Model output must be a JSON object.");
  const riskScore = requireFiniteNumber(value.riskScore, "riskScore", 0, 100);
  if (!Array.isArray(value.categoryIds)) throw validationError("categoryIds must be an array.");
  if (!Array.isArray(value.reasons)) throw validationError("reasons must be an array.");
  if (value.categoryIds.length > maxCategories) throw validationError(`categoryIds must contain at most ${maxCategories} entries.`);
  if (value.reasons.length > maxModelReasons) throw validationError(`reasons must contain at most ${maxModelReasons} entries.`);
  if (value.categoryIds.some((entry) => typeof entry !== "string")) {
    throw validationError("categoryIds must contain only strings.");
  }
  if (value.reasons.some((entry) => typeof entry !== "string")) {
    throw validationError("reasons must contain only strings.");
  }
  if (value.categoryIds.some((entry) => (entry as string).length > maxIdLength)) {
    throw validationError(`categoryIds entries must be at most ${maxIdLength} characters.`);
  }
  if (value.reasons.some((entry) => (entry as string).length > 500)) {
    throw validationError("reasons entries must be at most 500 characters.");
  }
  const configured = new Set(policy.categories.map((category) => category.id));
  const categories = Array.from(new Set(value.categoryIds
    .map((entry) => entry as string)
    .map((entry) => entry.trim())
    .filter((entry) => configured.has(entry))));
  const reasons = value.reasons
    .map((entry) => (entry as string).trim())
    .filter(Boolean)
    .slice(0, 8);
  const decision = decisionForRiskScore(riskScore, policy);
  return {
    decision,
    categories,
    severity: severityForDecision(decision),
    riskScore,
    reasons,
    status: "success",
    source: "model",
    assessedAt: new Date().toISOString(),
    policyRevision: policy.revision,
  };
}

export function decisionForRiskScore(riskScore: number, policy: ContentSafetyPolicy): SourceSafetyDecision {
  if (riskScore >= policy.model.filterThreshold) return "filter";
  if (riskScore >= policy.model.reviewThreshold) return "review";
  return "allow";
}

function normalizeCategories(value: unknown): ContentSafetyPolicyCategory[] {
  if (!Array.isArray(value)) throw validationError("categories must be an array.");
  if (value.length > maxCategories) throw validationError(`categories must contain at most ${maxCategories} entries.`);
  const ids = new Set<string>();
  return value.map((entry, index) => {
    const category = requireRecord(entry, `categories[${index}] must be an object.`);
    const id = requireIdentifier(category.id, `categories[${index}].id`);
    if (ids.has(id)) throw validationError(`Duplicate category id: ${id}.`);
    ids.add(id);
    const result: ContentSafetyPolicyCategory = {
      id,
      label: requireString(category.label, `categories[${index}].label`, maxLabelLength),
    };
    if (category.description !== undefined) {
      result.description = requireString(category.description, `categories[${index}].description`, maxDescriptionLength, true);
    }
    return result;
  });
}

function normalizeRules(value: unknown, categoryIds: Set<string>): ContentSafetyPolicyRule[] {
  if (!Array.isArray(value)) throw validationError("local.rules must be an array.");
  if (value.length > maxRules) throw validationError(`local.rules must contain at most ${maxRules} entries.`);
  const ruleIds = new Set<string>();
  return value.map((entry, index) => {
    const rule = requireRecord(entry, `local.rules[${index}] must be an object.`);
    const id = requireIdentifier(rule.id, `local.rules[${index}].id`);
    if (ruleIds.has(id)) throw validationError(`Duplicate rule id: ${id}.`);
    ruleIds.add(id);
    if (!allowedActions.has(rule.action as SourceSafetyDecision)) {
      throw validationError(`local.rules[${index}].action must be allow, review, or filter.`);
    }
    if (!Array.isArray(rule.categoryIds)) throw validationError(`local.rules[${index}].categoryIds must be an array.`);
    const references = Array.from(new Set(rule.categoryIds.map((categoryId, categoryIndex) =>
      requireIdentifier(categoryId, `local.rules[${index}].categoryIds[${categoryIndex}]`))));
    const unknown = references.find((categoryId) => !categoryIds.has(categoryId));
    if (unknown) throw validationError(`Rule ${id} references unknown category ${unknown}.`);
    return {
      id,
      name: requireString(rule.name, `local.rules[${index}].name`, maxLabelLength),
      enabled: requireBoolean(rule.enabled, `local.rules[${index}].enabled`),
      action: rule.action as SourceSafetyDecision,
      categoryIds: references,
      groups: normalizeGroups(rule.groups, index),
    };
  });
}

function normalizeGroups(value: unknown, ruleIndex: number): ContentSafetyPolicyConditionGroup[] {
  if (!Array.isArray(value) || value.length === 0) throw validationError(`local.rules[${ruleIndex}].groups must not be empty.`);
  if (value.length > maxGroupsPerRule) throw validationError(`A rule may contain at most ${maxGroupsPerRule} groups.`);
  return value.map((entry, groupIndex) => {
    const prefix = `local.rules[${ruleIndex}].groups[${groupIndex}]`;
    const group = requireRecord(entry, `${prefix} must be an object.`);
    if (!Array.isArray(group.fields) || group.fields.length === 0) throw validationError(`${prefix}.fields must not be empty.`);
    const fields = Array.from(new Set(group.fields.map((field) => {
      if (!allowedFields.has(field as ContentSafetyPolicyField)) throw validationError(`${prefix}.fields contains an invalid field.`);
      return field as ContentSafetyPolicyField;
    })));
    if (group.mode !== "any" && group.mode !== "all" && group.mode !== "at_least") {
      throw validationError(`${prefix}.mode must be any, all, or at_least.`);
    }
    if (!Array.isArray(group.terms) || group.terms.length === 0) throw validationError(`${prefix}.terms must not be empty.`);
    if (group.terms.length > maxTermsPerGroup) throw validationError(`A group may contain at most ${maxTermsPerGroup} terms.`);
    const terms: string[] = [];
    const normalizedTerms = new Set<string>();
    group.terms.forEach((term, termIndex) => {
      const value = requireString(term, `${prefix}.terms[${termIndex}]`, maxTermLength);
      const normalized = normalizeMatchText(value);
      if (normalizedTerms.has(normalized)) return;
      normalizedTerms.add(normalized);
      terms.push(value);
    });
    const atLeast = group.mode === "at_least"
      ? requireInteger(group.atLeast, `${prefix}.atLeast`, 1, terms.length)
      : undefined;
    return { fields, mode: group.mode, ...(atLeast ? { atLeast } : {}), terms };
  });
}

function groupMatches(group: ContentSafetyPolicyConditionGroup, fields: Record<ContentSafetyPolicyField, string>) {
  const haystack = group.fields.map((field) => fields[field]).join("\n");
  const hits = group.terms.reduce((count, term) => count + (haystack.includes(normalizeMatchText(term)) ? 1 : 0), 0);
  if (group.mode === "all") return hits === group.terms.length;
  if (group.mode === "at_least") return hits >= (group.atLeast || 1);
  return hits > 0;
}

function baseAssessment(
  decision: SourceSafetyDecision,
  source: "local",
  policyRevision: number,
  assessedAt: string,
): SourceSafetyAssessment {
  return {
    decision,
    categories: [],
    severity: severityForDecision(decision),
    reasons: [],
    status: "success",
    source,
    assessedAt,
    policyRevision,
  };
}

function severityForDecision(decision: SourceSafetyDecision): SourceSafetySeverity {
  return decision === "filter" ? "high" : decision === "review" ? "medium" : "low";
}

function normalizeMatchText(value: string) {
  return value.toLocaleLowerCase().replace(/\s+/gu, "");
}

function assertExpectedRevision(expectedRevision: number, currentRevision: number) {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw validationError("expectedRevision must be a non-negative integer.");
  if (expectedRevision !== currentRevision) throw new ContentSafetyPolicyConflictError(currentRevision);
}

function parseStoredPolicy(stored: string | undefined) {
  if (!stored) return createDefaultContentSafetyPolicy();
  try {
    return normalizeContentSafetyPolicy(JSON.parse(stored));
  } catch {
    return createDefaultContentSafetyPolicy();
  }
}

async function recordPolicyAudit(
  action: "Content safety policy saved" | "Content safety policy reset",
  policy: ContentSafetyPolicy,
  actor: Pick<WorkspaceAccount, "id" | "displayName">,
) {
  await recordExecutionLog({
    scope: "content-safety/policy",
    action,
    status: "success",
    message: `${action} at revision ${policy.revision}.`,
    ownerUserId: actor.id,
    ownerDisplayName: actor.displayName,
    details: {
      policyRevision: policy.revision,
      enabled: policy.enabled,
      localEnabled: policy.local.enabled,
      modelEnabled: policy.model.enabled,
      modelScope: policy.model.scope,
      categoryCount: policy.categories.length,
      ruleCount: policy.local.rules.length,
      enabledRuleCount: policy.local.rules.filter((rule) => rule.enabled).length,
      reviewThreshold: policy.model.reviewThreshold,
      filterThreshold: policy.model.filterThreshold,
      actorId: actor.id,
      actorDisplayName: actor.displayName,
    },
  });
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw validationError(message);
  return value as Record<string, unknown>;
}

function requireBoolean(value: unknown, name: string) {
  if (typeof value !== "boolean") throw validationError(`${name} must be a boolean.`);
  return value;
}

function requireString(value: unknown, name: string, maxLength: number, allowEmpty = false) {
  if (typeof value !== "string") throw validationError(`${name} must be a string.`);
  const normalized = value.trim();
  if (!allowEmpty && !normalized) throw validationError(`${name} must not be empty.`);
  if (normalized.length > maxLength) throw validationError(`${name} must be at most ${maxLength} characters.`);
  return normalized;
}

function requireIdentifier(value: unknown, name: string) {
  const id = requireString(value, name, maxIdLength);
  if (!/^[a-z][a-z0-9_-]*$/i.test(id)) throw validationError(`${name} must use letters, numbers, underscores, or hyphens and start with a letter.`);
  return id;
}

function requireInteger(value: unknown, name: string, min: number, max: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw validationError(`${name} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

function requireFiniteNumber(value: unknown, name: string, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw validationError(`${name} must be a number from ${min} to ${max}.`);
  }
  return value;
}

function requireIsoDate(value: unknown, name: string) {
  const date = requireString(value, name, 40);
  if (!Number.isFinite(Date.parse(date))) throw validationError(`${name} must be an ISO date.`);
  return date;
}

function validationError(message: string) {
  return new ContentSafetyPolicyValidationError(message);
}

function clonePolicy(policy: ContentSafetyPolicy): ContentSafetyPolicy {
  return JSON.parse(JSON.stringify(policy)) as ContentSafetyPolicy;
}
