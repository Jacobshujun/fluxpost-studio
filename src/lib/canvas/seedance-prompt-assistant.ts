export const SEEDANCE_ASSISTANT_MODES = ["auto", "text", "image", "storyboard", "rewrite"] as const;
export const SEEDANCE_ASSISTANT_ACTIONS = ["generate", "rewrite", "shorten", "hook", "repair"] as const;
export const SEEDANCE_ASSISTANT_RATIOS = ["9:16", "16:9", "1:1", "3:4", "4:3", "21:9"] as const;

export type SeedanceAssistantMode = typeof SEEDANCE_ASSISTANT_MODES[number];
export type SeedanceAssistantAction = typeof SEEDANCE_ASSISTANT_ACTIONS[number];
export type SeedanceAssistantRisk = "low" | "medium" | "high";

export type SeedanceAssistantReference = {
  id: string;
  number: number;
  url: string;
  name?: string;
};

export type SeedanceAssistantPromptPart =
  | { type: "text"; value: string }
  | { type: "image"; referenceId: string };

export type SeedancePromptAssistantRequest = {
  action: SeedanceAssistantAction;
  mode: SeedanceAssistantMode;
  intent: string;
  existingPrompt: string;
  duration: number;
  ratio: string;
  references: SeedanceAssistantReference[];
};

export type SeedanceAssistantChecks = {
  characterCount: number;
  referencesValid: boolean;
  timelineComplete: boolean;
  hookPresent: boolean;
  cameraConflict: boolean;
};

export type SeedanceAssistantCandidate = {
  id: string;
  title: string;
  promptParts: SeedanceAssistantPromptPart[];
  duration: number;
  ratio: string;
  complianceRisk: SeedanceAssistantRisk;
  warnings: string[];
  checks: SeedanceAssistantChecks;
};

export type SeedancePromptAssistantResponse = {
  resolvedMode: Exclude<SeedanceAssistantMode, "auto">;
  candidates: SeedanceAssistantCandidate[];
};

type SeedancePromptAssistantDeps = {
  generateText: (prompt: string) => Promise<string>;
  generateVision: (prompt: string, imageUrls: string[]) => Promise<string>;
};

type RawCandidate = {
  title?: unknown;
  promptParts?: unknown;
  duration?: unknown;
  ratio?: unknown;
  complianceRisk?: unknown;
  warnings?: unknown;
};

const highRiskTerms = ["未成年人色情", "裸体未成年人", "血腥肢解", "自杀教程", "恐怖主义宣传"];
const mediumRiskTerms = ["写实真人面部", "偷拍", "会所", "包间", "KTV", "美女群像", "商K", "爵士钢琴", "Lounge", "Bossa Nova", "Smooth Jazz"];

export class SeedancePromptAssistantInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedancePromptAssistantInputError";
  }
}

export async function createSeedancePromptCandidates(
  input: unknown,
  deps: SeedancePromptAssistantDeps,
): Promise<SeedancePromptAssistantResponse> {
  const normalized = normalizeSeedancePromptAssistantRequest(input);
  const resolvedMode = resolveSeedanceAssistantMode(normalized);
  const prompt = buildSeedanceAssistantModelPrompt(normalized, resolvedMode);
  const useVision = (resolvedMode === "image" || resolvedMode === "storyboard") && normalized.references.length > 0;
  const raw = useVision
    ? await deps.generateVision(prompt, normalized.references.slice(0, 8).map((reference) => reference.url))
    : await deps.generateText(prompt);
  const candidates = parseSeedanceAssistantModelResponse(raw, normalized);
  return { resolvedMode, candidates };
}

export function normalizeSeedancePromptAssistantRequest(input: unknown): SeedancePromptAssistantRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new SeedancePromptAssistantInputError("请求内容必须是对象。");
  const value = input as Record<string, unknown>;
  const action = stringEnum(value.action, SEEDANCE_ASSISTANT_ACTIONS, "操作类型");
  const mode = stringEnum(value.mode, SEEDANCE_ASSISTANT_MODES, "生成模式");
  const intent = inputString(value.intent, 4000, "创意要求");
  const existingPrompt = inputString(value.existingPrompt, 2000, "现有 Prompt");
  if (!intent && !existingPrompt) throw new SeedancePromptAssistantInputError("请填写创意需求，或先提供需要优化的 Prompt。");
  const duration = Number(value.duration);
  if (!Number.isInteger(duration) || duration < 4 || duration > 15) throw new SeedancePromptAssistantInputError("视频时长必须是 4-15 秒的整数。");
  const ratio = stringEnum(value.ratio, SEEDANCE_ASSISTANT_RATIOS, "视频比例");
  if (!Array.isArray(value.references)) throw new SeedancePromptAssistantInputError("参考图必须是数组。");
  if (value.references.length > 9) throw new SeedancePromptAssistantInputError("Seedance 最多支持 9 张参考图。");
  const references = value.references.map((reference, index) => normalizeReference(reference, index));
  if (new Set(references.map((reference) => reference.id)).size !== references.length) {
    throw new SeedancePromptAssistantInputError("参考图 ID 必须唯一。");
  }
  return { action, mode, intent, existingPrompt, duration, ratio, references };
}

export function resolveSeedanceAssistantMode(input: SeedancePromptAssistantRequest): Exclude<SeedanceAssistantMode, "auto"> {
  if (input.mode !== "auto") return input.mode;
  if (input.action !== "generate" || input.existingPrompt) return "rewrite";
  if (!input.references.length) return "text";
  return input.references.length >= 4 || /分镜|故事板|漫画|宫格|拼贴/.test(input.intent) ? "storyboard" : "image";
}

export function buildSeedanceAssistantModelPrompt(
  input: SeedancePromptAssistantRequest,
  resolvedMode: Exclude<SeedanceAssistantMode, "auto">,
) {
  const referenceList = input.references.length
    ? input.references.map((reference) => `- ${reference.id}: @图片${reference.number}${reference.name ? `（${reference.name}）` : ""}`).join("\n")
    : "- 无参考图";
  return [
    "你是 FluxPost 的 Seedance 2.5 视频提示词导演。只输出一个 JSON 对象，不要 Markdown，不要解释。",
    "目标：把简短创意或现有 Prompt 改成两套差异明确、可直接生成的中文视频提示词。",
    `模式：${resolvedMode}；操作：${input.action}；时长：${input.duration}秒；比例：${input.ratio}。`,
    "共同规则：前2秒出现核心视觉 Hook；15秒内只表达一件事；动作按时间顺序；13-15秒使用覆盖完整时长的时间段；运镜每镜最多双轴；近景禁止大幅环绕；避免空泛的‘电影感’堆词。",
    "参考规则：只能引用清单中的 referenceId；不要在 text 中手写 @图片N、图片N 或 referenceId；需要引用时单独输出 image part。",
    "图生视频：把图片当框架参考，文字主要补动作、节奏、运镜与限制；简单场景保持精炼。分镜板：声明不复刻格线、编号、UI和分隔线。",
    "合规规则：不要生成写实真人面部复刻、违法危险教程、色情或血腥内容；避免偷拍、会所、包间、KTV、商K及夜场BGM联想词。",
    "输出 schema：{\"candidates\":[{\"title\":\"短标题\",\"promptParts\":[{\"type\":\"text\",\"value\":\"...\"},{\"type\":\"image\",\"referenceId\":\"ref-1\"}],\"duration\":8,\"ratio\":\"9:16\",\"complianceRisk\":\"low|medium|high\",\"warnings\":[\"...\"]}]}。",
    "必须恰好返回 2 个 candidates。promptParts 按最终语序排列，每套提示词合并后不超过 1900 字符。warnings 没有问题时返回空数组。",
    `参考图清单：\n${referenceList}`,
    `用户创意：\n${input.intent || "未补充"}`,
    `现有 Prompt：\n${input.existingPrompt || "无"}`,
  ].join("\n\n");
}

export function parseSeedanceAssistantModelResponse(
  text: string,
  input: SeedancePromptAssistantRequest,
): SeedanceAssistantCandidate[] {
  const value = parseJsonObject(text);
  if (!Array.isArray(value.candidates) || value.candidates.length !== 2) {
    throw new Error("提示词模型必须返回两套候选方案。");
  }
  return value.candidates.map((candidate, index) => auditCandidate(candidate as RawCandidate, index, input));
}

export function serializeSeedanceAssistantPrompt(
  parts: SeedanceAssistantPromptPart[],
  references: SeedanceAssistantReference[],
) {
  const numberById = new Map(references.map((reference) => [reference.id, reference.number]));
  return parts.map((part) => part.type === "text" ? part.value : `图片${numberById.get(part.referenceId) || "?"}`).join("").trim();
}

function auditCandidate(raw: RawCandidate, index: number, input: SeedancePromptAssistantRequest): SeedanceAssistantCandidate {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`第 ${index + 1} 套候选格式无效。`);
  const title = normalizedString(raw.title, 40);
  if (!title) throw new Error(`第 ${index + 1} 套候选缺少标题。`);
  if (!Array.isArray(raw.promptParts) || !raw.promptParts.length) throw new Error(`第 ${index + 1} 套候选缺少 Prompt。`);
  const referenceIds = new Set(input.references.map((reference) => reference.id));
  const promptParts = raw.promptParts.map((part, partIndex) => normalizePromptPart(part, partIndex, referenceIds));
  const prompt = serializeSeedanceAssistantPrompt(promptParts, input.references);
  if (!prompt) throw new Error(`第 ${index + 1} 套候选 Prompt 为空。`);
  if (prompt.length > 2000) throw new Error(`第 ${index + 1} 套候选超过 Seedance 2000 字符限制。`);
  const duration = Number(raw.duration);
  if (!Number.isInteger(duration) || duration < 4 || duration > 15) throw new Error(`第 ${index + 1} 套候选时长无效。`);
  if (typeof raw.ratio !== "string" || !(SEEDANCE_ASSISTANT_RATIOS as readonly string[]).includes(raw.ratio)) {
    throw new Error(`第 ${index + 1} 套候选比例无效。`);
  }
  const ratio = raw.ratio as typeof SEEDANCE_ASSISTANT_RATIOS[number];
  const modelRisk = raw.complianceRisk === "high" || raw.complianceRisk === "medium" ? raw.complianceRisk : "low";
  const risk = resolveComplianceRisk(prompt, modelRisk);
  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings.map((warning) => normalizedString(warning, 180)).filter(Boolean).slice(0, 6)
    : [];
  const cameraConflict = hasCameraConflict(prompt);
  const timelineComplete = duration < 13 || hasCompleteTimeline(prompt, duration);
  const hookPresent = hasOpeningHook(prompt);
  if (cameraConflict) warnings.push("检测到单镜头三轴运动或近景大幅环绕，请简化运镜。");
  if (!timelineComplete) warnings.push("13-15 秒方案需要覆盖完整时长的时间段。");
  if (!hookPresent) warnings.push("前 2 秒的视觉 Hook 不够明确。");
  if (input.references.length > 8 && (input.mode === "image" || input.mode === "storyboard" || input.mode === "auto")) {
    warnings.push("视觉模型仅分析了前 8 张参考图，第 9 张只按清单引用。");
  }
  return {
    id: `candidate-${index + 1}`,
    title,
    promptParts,
    duration,
    ratio,
    complianceRisk: risk,
    warnings: Array.from(new Set(warnings)),
    checks: {
      characterCount: prompt.length,
      referencesValid: true,
      timelineComplete,
      hookPresent,
      cameraConflict,
    },
  };
}

function normalizePromptPart(value: unknown, index: number, referenceIds: Set<string>): SeedanceAssistantPromptPart {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Prompt 第 ${index + 1} 段格式无效。`);
  const part = value as Record<string, unknown>;
  if (part.type === "text") {
    const text = typeof part.value === "string" ? part.value.trim() : "";
    if (!text) throw new Error(`Prompt 第 ${index + 1} 段文字为空。`);
    if (/@图片\d|图片\d|referenceId|ref-\d/i.test(text)) throw new Error("模型必须使用结构化图片引用，不能在文字中手写图片编号。");
    return { type: "text", value: text };
  }
  if (part.type === "image") {
    const referenceId = normalizedString(part.referenceId, 80);
    if (!referenceIds.has(referenceId)) throw new Error(`Prompt 引用了不存在的参考图 ${referenceId || "(empty)"}。`);
    return { type: "image", referenceId };
  }
  throw new Error(`Prompt 第 ${index + 1} 段类型无效。`);
}

function normalizeReference(value: unknown, index: number): SeedanceAssistantReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SeedancePromptAssistantInputError(`第 ${index + 1} 张参考图格式无效。`);
  const reference = value as Record<string, unknown>;
  const id = inputString(reference.id, 80, `第 ${index + 1} 张参考图 ID`);
  const url = inputString(reference.url, 4000, `第 ${index + 1} 张参考图 URL`);
  const number = Number(reference.number);
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new SeedancePromptAssistantInputError(`第 ${index + 1} 张参考图 ID 无效。`);
  if (!Number.isInteger(number) || number < 1 || number > 9) throw new SeedancePromptAssistantInputError(`第 ${index + 1} 张参考图编号无效。`);
  if (!/^https?:\/\//i.test(url)) throw new SeedancePromptAssistantInputError(`第 ${index + 1} 张参考图必须使用 HTTP(S) URL。`);
  return { id, number, url, name: inputString(reference.name, 120, `第 ${index + 1} 张参考图名称`) || undefined };
}

function resolveComplianceRisk(prompt: string, modelRisk: SeedanceAssistantRisk): SeedanceAssistantRisk {
  if (modelRisk === "high" || highRiskTerms.some((term) => prompt.includes(term))) return "high";
  if (modelRisk === "medium" || mediumRiskTerms.some((term) => prompt.toLowerCase().includes(term.toLowerCase()))) return "medium";
  return "low";
}

function hasCameraConflict(prompt: string) {
  const tripleAxis = /(?:推|拉|推进|后退)[^。；]{0,24}(?:升|降|俯|仰)[^。；]{0,24}(?:环绕|旋转|横移)|(?:环绕|旋转)[^。；]{0,24}(?:推|拉|推进)[^。；]{0,24}(?:升|降)/;
  const closeOrbit = /(?:特写|大特写|近景|Z[123])[^。；]{0,28}(?:大幅|360|环绕|旋转)|(?:大幅|360|环绕|旋转)[^。；]{0,28}(?:特写|大特写|近景|Z[123])/i;
  return tripleAxis.test(prompt) || closeOrbit.test(prompt);
}

function hasCompleteTimeline(prompt: string, duration: number) {
  const ranges = Array.from(prompt.matchAll(/(\d{1,2})\s*[-~—至]\s*(\d{1,2})\s*(?:秒|s)?/gi), (match) => [Number(match[1]), Number(match[2])] as const);
  if (!ranges.length) return false;
  const covered = new Set<number>();
  for (const [start, end] of ranges) for (let second = start; second < end; second += 1) covered.add(second);
  return Array.from({ length: duration }, (_, second) => second).every((second) => covered.has(second));
}

function hasOpeningHook(prompt: string) {
  const opening = prompt.slice(0, Math.min(prompt.length, 420));
  return /(?:0\s*[-~—至]\s*[1-4]|前\s*2\s*秒|开场|第一秒|首帧|瞬间|突然|猛地|爆发|直视|撞入|冲入)/i.test(opening);
}

function parseJsonObject(text: string): Record<string, unknown> {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let value: unknown;
  try {
    value = JSON.parse(normalized);
  } catch {
    throw new Error("提示词模型返回了无效 JSON。");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("提示词模型返回格式无效。");
  return value as Record<string, unknown>;
}

function normalizedString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function inputString(value: unknown, maxLength: number, label: string) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new SeedancePromptAssistantInputError(`${label}必须是文字。`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new SeedancePromptAssistantInputError(`${label}不能超过 ${maxLength} 字符。`);
  return normalized;
}

function stringEnum<const T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) throw new SeedancePromptAssistantInputError(`${label}无效。`);
  return value as T[number];
}
