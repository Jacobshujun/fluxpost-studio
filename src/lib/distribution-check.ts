import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { compactError, recordExecutionLog } from "./activity-log";
import { appConfig, openaiTextUrl } from "./config";
import { runWithConcurrencyPool } from "./concurrency";
import { defaultDistributionCheckPrompt } from "./distribution-check-prompt";
import { resolveFeishuCliInvocation } from "./feishu-cli";

const execFileAsync = promisify(execFile);

export type DistributionDecision = "可分发" | "不可分发";

export type DistributionCheckItemResult = {
  number: string;
  recordId?: string;
  status: "updated" | "not_found" | "failed";
  distribution?: DistributionDecision;
  title?: string;
  vehicle?: string;
  previousValue?: string;
  confidence?: number;
  riskTags?: string[];
  reasons?: string[];
  error?: string;
};

export type DistributionCheckResponse = {
  total: number;
  updated: number;
  distributable: number;
  blocked: number;
  failed: number;
  results: DistributionCheckItemResult[];
};

type CliResult = {
  stdout: string;
  stderr: string;
};

type DistributionFieldMap = {
  number: string;
  title: string;
  body: string;
  materials: string;
  vehicle: string;
  distribution: string;
};

type DistributionRecord = {
  requestedNumber: string;
  recordId: string;
  fields: Record<string, unknown>;
  number: string;
  title: string;
  body: string;
  vehicle: string;
  previousValue: string;
  materialCount: number;
};

type DistributionAssessment = {
  distribution: DistributionDecision;
  confidence: number;
  riskTags: string[];
  reasons: string[];
};

type DistributionCheckOptions = {
  prompt?: string;
};

type ModelAssessmentJson = {
  distribution?: unknown;
  confidence?: unknown;
  riskTags?: unknown;
  reasons?: unknown;
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

const defaultFieldMap: DistributionFieldMap = {
  number: "编号",
  title: "动态标题",
  body: "动态正文",
  materials: "动态素材",
  vehicle: "车型",
  distribution: "是否分发",
};

const maxNumbersPerBatch = 200;
const feishuRecordSearchKeywordMaxLength = 50;

const personaPatterns = [
  /我(的|家|们|今天|昨天|终于|刚|在|去|提|买|开|试|订|换|觉得|感觉|分享)/,
  /本人|老婆|老公|媳妇|孩子|宝宝|爸妈|妈妈|爸爸|朋友|闺蜜|同事/,
  /提车|交付|车主|用车(记录|日常|感受|体验)|提车作业|新车到手/,
  /私信|粉丝|主页|关注我|评论区|我的账号|博主/,
];

const privacyPatterns = [/露脸|自拍|合照|车牌|身份证|手机号|住址|小区|门店员工|销售顾问|家庭照/];

const unsafePatterns = [/傻|垃圾|智商税|别买|劝退|投诉|维权|翻车|恶心|不配|吊打|碾压|秒杀/];

const competitorPatterns = [/特斯拉|Tesla|理想|蔚来|问界|小米汽车|比亚迪|极氪|智界|宝马|奔驰|奥迪/i];

export async function runDistributionCheck(input: unknown, options: DistributionCheckOptions = {}): Promise<DistributionCheckResponse> {
  const startedAt = Date.now();
  const numbers = normalizeNumberInput(input);
  if (!numbers.length) throw new Error("At least one Feishu record number is required.");
  if (!appConfig.feishuCliBin || !appConfig.feishuDistributionCheckBaseToken || !appConfig.feishuDistributionCheckTableId) {
    throw new Error("Distribution check needs FEISHU_CLI_BIN and Feishu Base table config.");
  }

  const fieldMap = getDistributionFieldMap();
  await assertDistributionFieldsReady(fieldMap);
  const results: DistributionCheckItemResult[] = [];
  const readyToUpdate: Array<DistributionCheckItemResult & { recordId: string; distribution: DistributionDecision }> = [];

  for (const number of numbers) {
    try {
      const record = isLikelyRecordId(number)
        ? await getDistributionRecord(number, number, fieldMap)
        : await findDistributionRecordByNumber(number, fieldMap);
      if (!record) {
        results.push({
          number,
          status: "not_found",
          error: "No exact Feishu record matched this number.",
        });
        continue;
      }

      const assessment = await assessDistributionRecord(record, options);
      readyToUpdate.push({
        number,
        recordId: record.recordId,
        status: "updated",
        distribution: assessment.distribution,
        title: record.title,
        vehicle: record.vehicle,
        previousValue: record.previousValue,
        confidence: assessment.confidence,
        riskTags: assessment.riskTags,
        reasons: assessment.reasons,
      });
    } catch (error) {
      results.push({
        number,
        status: "failed",
        error: compactCliError(error),
      });
    }
  }

  for (const decision of ["可分发", "不可分发"] as DistributionDecision[]) {
    const group = readyToUpdate.filter((item) => item.distribution === decision);
    if (!group.length) continue;
    try {
      await updateDistributionRecords(group.map((item) => item.recordId), decision, fieldMap);
      results.push(...group);
    } catch (error) {
      results.push(
        ...group.map((item) => ({
          ...item,
          status: "failed" as const,
          error: compactCliError(error),
        })),
      );
    }
  }

  const summary = buildDistributionSummary(results, numbers.length);
  await recordExecutionLog({
    scope: "feishu/distribution-check",
    action: "Distribution check completed",
    status: summary.updated ? "success" : "error",
    message: `Distribution check updated ${summary.updated}/${summary.total} Feishu record(s).`,
    durationMs: Date.now() - startedAt,
    details: {
      total: summary.total,
      updated: summary.updated,
      distributable: summary.distributable,
      blocked: summary.blocked,
      failed: summary.failed,
    },
  });
  return summary;
}

export function normalizeDistributionNumberInput(input: unknown) {
  return normalizeNumberInput(input);
}

function getDistributionFieldMap(): DistributionFieldMap {
  if (!appConfig.feishuDistributionCheckFieldMap.trim()) return defaultFieldMap;
  try {
    const parsed = JSON.parse(appConfig.feishuDistributionCheckFieldMap) as Record<string, unknown>;
    return {
      ...defaultFieldMap,
      ...Object.fromEntries(
        Object.entries(parsed)
          .filter(([, value]) => typeof value === "string" && value.trim())
          .map(([key, value]) => [key, (value as string).trim()]),
      ),
    };
  } catch (error) {
    throw new Error(`FEISHU_DISTRIBUTION_CHECK_FIELD_MAP must be valid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`);
  }
}

async function findDistributionRecordByNumber(number: string, fieldMap: DistributionFieldMap) {
  const payload = {
    keyword: compactRecordSearchKeyword(number),
    search_fields: [fieldMap.number],
    select_fields: [fieldMap.number, fieldMap.title, fieldMap.body, fieldMap.materials, fieldMap.vehicle, fieldMap.distribution],
    limit: 10,
  };
  const result = await runFeishuDistributionCli(
    [
      "base",
      "+record-search",
      "--as",
      "bot",
      "--base-token",
      appConfig.feishuDistributionCheckBaseToken,
      "--table-id",
      appConfig.feishuDistributionCheckTableId,
      "--format",
      "json",
      "--json",
      JSON.stringify(payload),
    ],
    60_000,
  );
  const record = findRecordWithExactNumber(parseJsonOutput(result.stdout), fieldMap, number);
  return record ? normalizeDistributionRecord(number, record, fieldMap) : undefined;
}

async function assertDistributionFieldsReady(fieldMap: DistributionFieldMap) {
  const result = await runFeishuDistributionCli(
    [
      "base",
      "+field-list",
      "--as",
      "bot",
      "--base-token",
      appConfig.feishuDistributionCheckBaseToken,
      "--table-id",
      appConfig.feishuDistributionCheckTableId,
      "--jq",
      ".",
      "--limit",
      "200",
    ],
    60_000,
  );
  const fields = extractFieldDescriptors(parseJsonOutput(result.stdout));
  const names = new Set(fields.map((field) => field.name).filter(Boolean));
  const missing = [
    fieldMap.number,
    fieldMap.title,
    fieldMap.body,
    fieldMap.materials,
    fieldMap.vehicle,
    fieldMap.distribution,
  ].filter((field) => !names.has(field));
  if (missing.length) throw new Error(`Distribution check target Base is missing field(s): ${missing.join(", ")}`);

  const distributionField = fields.find((field) => field.name === fieldMap.distribution);
  if (distributionField?.type && !/single|select|option/i.test(distributionField.type)) {
    throw new Error(`Distribution field ${fieldMap.distribution} must be a single-select writable field.`);
  }
}

async function getDistributionRecord(requestedNumber: string, recordId: string, fieldMap: DistributionFieldMap) {
  const result = await runFeishuDistributionCli(
    [
      "base",
      "+record-get",
      "--as",
      "bot",
      "--base-token",
      appConfig.feishuDistributionCheckBaseToken,
      "--table-id",
      appConfig.feishuDistributionCheckTableId,
      "--record-id",
      recordId,
      "--format",
      "json",
    ],
    60_000,
  );
  const record = findRecordById(parseJsonOutput(result.stdout), recordId) || buildRecordFromObject(parseJsonOutput(result.stdout), recordId);
  return record ? normalizeDistributionRecord(requestedNumber, record, fieldMap) : undefined;
}

async function updateDistributionRecords(recordIds: string[], decision: DistributionDecision, fieldMap: DistributionFieldMap) {
  for (let index = 0; index < recordIds.length; index += 200) {
    const batch = recordIds.slice(index, index + 200);
    await runFeishuDistributionCli(
      [
        "base",
        "+record-batch-update",
        "--as",
        "bot",
        "--base-token",
        appConfig.feishuDistributionCheckBaseToken,
        "--table-id",
        appConfig.feishuDistributionCheckTableId,
        "--json",
        JSON.stringify({
          record_id_list: batch,
          patch: {
            [fieldMap.distribution]: decision,
          },
        }),
      ],
      120_000,
    );
  }
}

async function assessDistributionRecord(record: DistributionRecord, options: DistributionCheckOptions): Promise<DistributionAssessment> {
  const local = assessDistributionRecordLocally(record);
  if (local.distribution === "不可分发") return local;
  if (!appConfig.openaiApiKey) return local;

  try {
    const model = normalizeModelAssessment(await callDistributionModel(buildDistributionPrompt(record, local, options.prompt)));
    return mergeAssessments(local, model);
  } catch (error) {
    await recordExecutionLog({
      scope: "feishu/distribution-check",
      action: "Distribution check model failed",
      status: "error",
      message: compactError(error),
      details: {
        number: record.number,
        recordId: record.recordId,
        model: appConfig.openaiTextModel,
      },
    });
    return local;
  }
}

function assessDistributionRecordLocally(record: DistributionRecord): DistributionAssessment {
  const text = [record.title, record.body, record.vehicle].filter(Boolean).join("\n");
  const riskTags: string[] = [];
  const reasons: string[] = [];

  if (!text.trim()) {
    riskTags.push("内容为空");
    reasons.push("标题和正文为空，无法判断跨账号分发安全性。");
  }
  if (!record.materialCount) {
    riskTags.push("素材不足");
    reasons.push("未识别到动态素材，默认不进入跨账号分发。");
  }
  if (personaPatterns.some((pattern) => pattern.test(text))) {
    riskTags.push("人设口吻");
    reasons.push("内容包含第一人称、车主经历或账号身份表达。");
  }
  if (privacyPatterns.some((pattern) => pattern.test(text))) {
    riskTags.push("隐私风险");
    reasons.push("内容疑似包含露脸、车牌、家庭或私域信息。");
  }
  if (unsafePatterns.some((pattern) => pattern.test(text))) {
    riskTags.push("安全风险");
    reasons.push("内容包含强负面、攻击或风险表达。");
  }
  if (competitorPatterns.some((pattern) => pattern.test(text)) && /吊打|碾压|秒杀|不配|别买|垃圾/.test(text)) {
    riskTags.push("竞品拉踩");
    reasons.push("内容疑似包含竞品拉踩表达。");
  }

  const blocked = Boolean(riskTags.length);
  return {
    distribution: blocked ? "不可分发" : "可分发",
    confidence: blocked ? 0.82 : 0.62,
    riskTags: Array.from(new Set(riskTags)),
    reasons: reasons.length ? reasons.slice(0, 4) : ["未发现明显人设、隐私、素材或安全风险。"],
  };
}

async function callDistributionModel(prompt: string): Promise<ModelAssessmentJson> {
  const text =
    appConfig.openaiTextEndpoint === "chat"
      ? await callChatCompletions(prompt)
      : await callResponsesApi(prompt);
  return parseJsonObject(text) as ModelAssessmentJson;
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
    throw new Error(`OpenAI distribution check failed: ${response.status} ${body.slice(0, 260)}`);
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
    throw new Error(`OpenAI distribution chat check failed: ${response.status} ${body.slice(0, 260)}`);
  }
  const data = (await response.json()) as ChatCompletionResponse;
  return data.choices?.[0]?.message?.content || "{}";
}

function buildDistributionPrompt(record: DistributionRecord, local: DistributionAssessment, customPrompt?: string) {
  const auditPrompt = customPrompt?.trim() || defaultDistributionCheckPrompt;
  return [
    auditPrompt,
    "只允许输出 JSON。",
    "distribution 只能是“可分发”或“不可分发”。不确定时必须输出“不可分发”。",
    '输出 JSON 示例：{"distribution":"不可分发","confidence":0.86,"riskTags":["人设口吻"],"reasons":["包含车主第一人称体验"]}',
    `本地初判: ${local.distribution}; ${local.riskTags.join(",") || "无风险"}; ${local.reasons.join(" / ")}`,
    `编号: ${record.number}`,
    `车型: ${record.vehicle}`,
    `素材数量: ${record.materialCount}`,
    `标题: ${record.title}`,
    `正文: ${record.body.slice(0, 2400)}`,
  ].join("\n");
}

function normalizeModelAssessment(json: ModelAssessmentJson): DistributionAssessment {
  const distribution = json.distribution === "可分发" ? "可分发" : "不可分发";
  return {
    distribution,
    confidence: normalizeConfidence(json.confidence) ?? (distribution === "可分发" ? 0.7 : 0.75),
    riskTags: arrayOfStrings(json.riskTags).slice(0, 6),
    reasons: arrayOfStrings(json.reasons).slice(0, 4),
  };
}

function mergeAssessments(local: DistributionAssessment, model: DistributionAssessment): DistributionAssessment {
  if (local.distribution === "不可分发" || model.distribution === "不可分发") {
    return {
      distribution: "不可分发",
      confidence: Math.max(local.confidence, model.confidence),
      riskTags: Array.from(new Set([...local.riskTags, ...model.riskTags])),
      reasons: [...model.reasons, ...local.reasons].filter(Boolean).slice(0, 4),
    };
  }
  return {
    distribution: "可分发",
    confidence: Math.max(local.confidence, model.confidence),
    riskTags: [],
    reasons: (model.reasons.length ? model.reasons : local.reasons).slice(0, 4),
  };
}

async function runFeishuDistributionCli(args: string[], timeout: number): Promise<CliResult> {
  const invocation = resolveFeishuCliInvocation(appConfig.feishuCliBin);
  return runWithConcurrencyPool("feishu", async () => {
    try {
      const result = await execFileAsync(invocation.file, [...invocation.argsPrefix, ...args], {
        timeout,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 8,
        env: buildCliEnv(process.env),
      });
      return {
        stdout: typeof result.stdout === "string" ? result.stdout : String(result.stdout || ""),
        stderr: typeof result.stderr === "string" ? result.stderr : String(result.stderr || ""),
      };
    } catch (error) {
      throw sanitizeCliError(error);
    }
  });
}

function normalizeDistributionRecord(
  requestedNumber: string,
  record: { recordId: string; fields: Record<string, unknown> },
  fieldMap: DistributionFieldMap,
): DistributionRecord {
  return {
    requestedNumber,
    recordId: record.recordId,
    fields: record.fields,
    number: cellToText(record.fields[fieldMap.number]) || requestedNumber,
    title: cellToText(record.fields[fieldMap.title]),
    body: cellToText(record.fields[fieldMap.body]),
    vehicle: cellToText(record.fields[fieldMap.vehicle]),
    previousValue: cellToText(record.fields[fieldMap.distribution]),
    materialCount: extractFileTokens(record.fields[fieldMap.materials]).length,
  };
}

function findRecordWithExactNumber(value: unknown, fieldMap: DistributionFieldMap, number: string) {
  const expected = number.trim();
  return findTableRecordWithExactNumber(value, fieldMap, expected) || findObjectRecordWithExactNumber(value, fieldMap, expected);
}

function findTableRecordWithExactNumber(
  value: unknown,
  fieldMap: DistributionFieldMap,
  expected: string,
): { recordId: string; fields: Record<string, unknown> } | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findTableRecordWithExactNumber(item, fieldMap, expected);
      if (result) return result;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const fields = Array.isArray(record.fields) && record.fields.every((item) => typeof item === "string") ? (record.fields as string[]) : null;
  const rows = Array.isArray(record.data) ? record.data : null;
  const recordIds = Array.isArray(record.record_id_list) && record.record_id_list.every((item) => typeof item === "string")
    ? (record.record_id_list as string[])
    : null;

  if (fields && rows && recordIds) {
    const numberIndex = fields.indexOf(fieldMap.number);
    if (numberIndex >= 0) {
      for (const [index, row] of rows.entries()) {
        if (!Array.isArray(row)) continue;
        const recordId = recordIds[index];
        if (!recordId?.startsWith("rec")) continue;
        if (!cellMatchesExact(row[numberIndex], expected)) continue;
        return {
          recordId,
          fields: Object.fromEntries(fields.map((field, fieldIndex) => [field, row[fieldIndex]])),
        };
      }
    }
  }

  for (const child of Object.values(record)) {
    const result = findTableRecordWithExactNumber(child, fieldMap, expected);
    if (result) return result;
  }
  return undefined;
}

function findObjectRecordWithExactNumber(
  value: unknown,
  fieldMap: DistributionFieldMap,
  expected: string,
): { recordId: string; fields: Record<string, unknown> } | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findObjectRecordWithExactNumber(item, fieldMap, expected);
      if (result) return result;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const recordId = firstRecordId(record);
  const fields = objectRecordFields(record);
  if (recordId && cellMatchesExact(fields[fieldMap.number], expected)) return { recordId, fields };

  for (const child of Object.values(record)) {
    const result = findObjectRecordWithExactNumber(child, fieldMap, expected);
    if (result) return result;
  }
  return undefined;
}

function findRecordById(value: unknown, recordId: string): { recordId: string; fields: Record<string, unknown> } | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findRecordById(item, recordId);
      if (result) return result;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (firstRecordId(record) === recordId) return { recordId, fields: objectRecordFields(record) };
  const fields = Array.isArray(record.fields) && record.fields.every((item) => typeof item === "string") ? (record.fields as string[]) : null;
  const rows = Array.isArray(record.data) ? record.data : null;
  const recordIds = Array.isArray(record.record_id_list) && record.record_id_list.every((item) => typeof item === "string")
    ? (record.record_id_list as string[])
    : null;
  if (fields && rows && recordIds) {
    const index = recordIds.indexOf(recordId);
    const row = index >= 0 ? rows[index] : undefined;
    if (Array.isArray(row)) return { recordId, fields: Object.fromEntries(fields.map((field, fieldIndex) => [field, row[fieldIndex]])) };
  }

  for (const child of Object.values(record)) {
    const result = findRecordById(child, recordId);
    if (result) return result;
  }
  return undefined;
}

function buildRecordFromObject(value: unknown, fallbackRecordId: string) {
  const fields = objectRecordFields(value);
  if (Object.keys(fields).length) return { recordId: firstRecordId(value) || fallbackRecordId, fields };
  return undefined;
}

function objectRecordFields(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  if (record.fields && typeof record.fields === "object" && !Array.isArray(record.fields)) {
    return record.fields as Record<string, unknown>;
  }
  return record;
}

function cellMatchesExact(value: unknown, expected: string) {
  return flattenCellStrings(value).some((item) => item.trim() === expected);
}

function cellToText(value: unknown) {
  return Array.from(new Set(flattenPreferredCellText(value).map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean))).join("\n");
}

function flattenPreferredCellText(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flattenPreferredCellText);
  if (typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const preferred = ["text", "name", "value", "title"]
    .map((key) => record[key])
    .filter((item): item is string | number | boolean => typeof item === "string" || typeof item === "number" || typeof item === "boolean")
    .map(String);
  if (preferred.length) return preferred;
  return Object.values(record).flatMap(flattenPreferredCellText);
}

function flattenCellStrings(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flattenCellStrings);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(flattenCellStrings);
  return [];
}

function extractFileTokens(value: unknown) {
  const tokens: string[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const record = node as Record<string, unknown>;
    for (const key of ["file_token", "fileToken", "token"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) tokens.push(value.trim());
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return Array.from(new Set(tokens));
}

function extractFieldDescriptors(value: unknown): Array<{ name: string; type: string }> {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(extractFieldDescriptors);
  const record = value as Record<string, unknown>;
  const name = firstString(record.field_name, record.fieldName, record.name);
  const type = firstString(record.type, record.field_type, record.fieldType, record.ui_type, record.uiType);
  const current = name ? [{ name, type }] : [];
  return [...current, ...Object.values(record).flatMap(extractFieldDescriptors)];
}

function normalizeNumberInput(input: unknown) {
  const values = Array.isArray(input) ? input : typeof input === "string" ? splitNumberText(input) : [];
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean))).slice(0, maxNumbersPerBatch);
}

function splitNumberText(value: string) {
  return value.split(/[\r\n,，;；\t ]+/).map((item) => item.trim()).filter(Boolean);
}

function compactRecordSearchKeyword(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= feishuRecordSearchKeywordMaxLength) return text;
  return text.slice(0, feishuRecordSearchKeywordMaxLength);
}

function buildDistributionSummary(results: DistributionCheckItemResult[], total: number): DistributionCheckResponse {
  const updated = results.filter((item) => item.status === "updated").length;
  return {
    total,
    updated,
    distributable: results.filter((item) => item.status === "updated" && item.distribution === "可分发").length,
    blocked: results.filter((item) => item.status === "updated" && item.distribution === "不可分发").length,
    failed: results.filter((item) => item.status !== "updated").length,
    results: results.sort((a, b) => a.number.localeCompare(b.number, "zh-CN")),
  };
}

function parseJsonOutput(stdout: string) {
  if (!stdout.trim()) return {};
  return JSON.parse(stdout) as unknown;
}

function parseJsonObject(text: string): Record<string, unknown> {
  const normalized = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(normalized) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
}

function firstRecordId(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const id = record.record_id || record.recordId || record.id;
  return typeof id === "string" && id.startsWith("rec") ? id : undefined;
}

function isLikelyRecordId(value: string) {
  return /^rec[A-Za-z0-9]+$/.test(value.trim());
}

function normalizeConfidence(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(Math.max(parsed, 0), 1);
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim() || "";
}

function openaiHeaders() {
  return {
    Authorization: `Bearer ${appConfig.openaiApiKey}`,
    "Content-Type": "application/json",
  };
}

function sanitizeCliError(error: unknown) {
  if (!(error instanceof Error)) return new Error("Feishu distribution check CLI failed with an unknown error.");
  const next = new Error(sanitizeCliText(error.message));
  const source = error as Error & { stdout?: string; stderr?: string; code?: unknown; signal?: unknown };
  const target = next as Error & { stdout?: string; stderr?: string; code?: unknown; signal?: unknown };
  if (typeof source.stdout === "string") target.stdout = sanitizeCliText(source.stdout);
  if (typeof source.stderr === "string") target.stderr = sanitizeCliText(source.stderr);
  if (source.code !== undefined) target.code = source.code;
  if (source.signal !== undefined) target.signal = source.signal;
  return next;
}

function compactCliError(error: unknown) {
  return error instanceof Error ? sanitizeCliText(error.message) : compactError(error);
}

function sanitizeCliText(value: string) {
  let next = value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer ***").replace(/(--base-token\s+)(\S+)/gi, "$1***");
  for (const token of [appConfig.feishuDistributionCheckBaseToken, appConfig.feishuBitableAppToken]) {
    if (token) next = next.replaceAll(token, "***");
  }
  return next;
}

function buildCliEnv(env: NodeJS.ProcessEnv) {
  const nextEnv = { ...env };
  const proxy = nextEnv.HTTPS_PROXY || nextEnv.https_proxy || nextEnv.HTTP_PROXY || nextEnv.http_proxy || "";
  if (/^http:\/\/127\.0\.0\.1:9\/?$/i.test(proxy)) {
    nextEnv.LARK_CLI_NO_PROXY = "1";
    nextEnv.HTTPS_PROXY = "";
    nextEnv.HTTP_PROXY = "";
    nextEnv.https_proxy = "";
    nextEnv.http_proxy = "";
  }
  return nextEnv;
}
