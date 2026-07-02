import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { compactError, recordExecutionLog } from "./activity-log";
import { appConfig, openaiTextUrl } from "./config";
import { concurrencyConfig, mapWithConcurrency, runWithConcurrencyPool, type ConcurrencyPoolName } from "./concurrency";
import {
  claimNextDistributionCheckJob,
  getDistributionCheckJobFromDb,
  heartbeatDistributionCheckJob,
  readDistributionCheckJobsFromDb,
  saveDistributionCheckJobToDb,
} from "./database";
import { defaultDistributionCheckPrompt } from "./distribution-check-prompt";
import { resolveFeishuCliInvocation } from "./feishu-cli";
import { filterWorkspaceOwnedRecords, type WorkspaceAccessActor } from "./workspace-ownership";
import type {
  DistributionCheckItemResult,
  DistributionCheckJob,
  DistributionCheckResponse,
  DistributionDecision,
  DistributionScore,
  DistributionScoreDimension,
  DistributionScorePrediction,
} from "./types";

export type {
  DistributionCheckItemResult,
  DistributionCheckJob,
  DistributionCheckResponse,
  DistributionDecision,
  DistributionScore,
  DistributionScoreDimension,
  DistributionScorePrediction,
} from "./types";

const execFileAsync = promisify(execFile);

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
  contentScore: string;
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
  score: DistributionScore;
  riskTags: string[];
  reasons: string[];
};

type DistributionCheckOptions = {
  prompt?: string;
};

type ModelAssessmentJson = {
  distribution?: unknown;
  confidence?: unknown;
  score?: unknown;
  prediction?: unknown;
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
  contentScore: "内容评分",
};

const maxNumbersPerBatch = 1000;
const feishuRecordSearchKeywordMaxLength = 50;
const distributionScoreThreshold = 70;
const distributionCheckQueueWorkerConcurrency = readBoundedIntegerEnv("DISTRIBUTION_CHECK_WORKER_CONCURRENCY", 1, 1, 3);
const distributionCheckQueueLockMs = 15 * 60_000;
const distributionCheckQueueHeartbeatMs = 30_000;
const feishuDistributionCliMaxAttempts = 4;
const feishuDistributionCliBaseRetryDelayMs = 1200;

type ReadyDistributionUpdate = DistributionCheckItemResult & { recordId: string; distribution: DistributionDecision; score: DistributionScore };

type DistributionProgressEvent =
  | { type: "processed"; item?: DistributionCheckItemResult }
  | { type: "updated"; items: DistributionCheckItemResult[] };

type DistributionCheckQueueGlobalState = typeof globalThis & {
  __fluxpostDistributionCheckQueue?: {
    activeWorkers: number;
    sequence: number;
    reconciledAt?: string;
  };
};

const distributionCheckQueueState = ((globalThis as DistributionCheckQueueGlobalState).__fluxpostDistributionCheckQueue ||= {
  activeWorkers: 0,
  sequence: 0,
});

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
  assertDistributionConfigured();
  const summary = await runDistributionCheckWorkflow(numbers, options);
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

export async function enqueueDistributionCheckJob(
  input: unknown,
  options: DistributionCheckOptions & { ownerUserId: string; ownerDisplayName?: string; priority?: number },
) {
  const numbers = normalizeNumberInput(input);
  if (!numbers.length) throw new Error("At least one Feishu record number is required.");
  assertDistributionConfigured();

  const now = new Date().toISOString();
  const job: DistributionCheckJob = {
    id: `distribution-check-${Date.now()}-${randomUUID().slice(0, 8)}`,
    ownerUserId: options.ownerUserId,
    ownerDisplayName: options.ownerDisplayName,
    status: "queued",
    priority: Number(options.priority || 0),
    attempts: 0,
    maxAttempts: 1,
    runAfter: now,
    createdAt: now,
    updatedAt: now,
    numbers,
    processed: 0,
    total: numbers.length,
    updated: 0,
    distributable: 0,
    blocked: 0,
    failed: 0,
    results: [],
    prompt: options.prompt || "",
  };

  await saveDistributionCheckJobToDb(job);
  await recordExecutionLog({
    scope: "feishu/distribution-check",
    action: "Distribution check queued",
    status: "info",
    message: `Queued distribution check job ${job.id} for ${numbers.length} record(s).`,
    details: {
      jobId: job.id,
      ownerUserId: job.ownerUserId,
      total: numbers.length,
    },
    ownerUserId: job.ownerUserId,
    ownerDisplayName: job.ownerDisplayName,
  });
  ensureDistributionCheckQueueWorker();
  return job;
}

export async function listDistributionCheckJobs(limit = 30, account?: WorkspaceAccessActor) {
  await reconcileInterruptedDistributionCheckJobs();
  ensureDistributionCheckQueueWorker();
  return filterWorkspaceOwnedRecords(await readDistributionCheckJobsFromDb(limit), account);
}

export async function getDistributionCheckJob(jobId: string, account?: WorkspaceAccessActor) {
  await reconcileInterruptedDistributionCheckJobs();
  ensureDistributionCheckQueueWorker();
  const job = await getDistributionCheckJobFromDb(jobId);
  if (!job || (account && !filterWorkspaceOwnedRecords([job], account).length)) return undefined;
  return job;
}

export function ensureDistributionCheckQueueWorker() {
  while (distributionCheckQueueState.activeWorkers < distributionCheckQueueWorkerConcurrency) {
    distributionCheckQueueState.activeWorkers += 1;
    distributionCheckQueueState.sequence += 1;
    const workerId = `distribution-check-worker-${process.pid}-${Date.now()}-${distributionCheckQueueState.sequence}`;
    setTimeout(() => {
      void drainDistributionCheckQueue(workerId).finally(() => {
        distributionCheckQueueState.activeWorkers = Math.max(0, distributionCheckQueueState.activeWorkers - 1);
      });
    }, 0);
  }
}

export function normalizeDistributionNumberInput(input: unknown) {
  return normalizeNumberInput(input);
}

async function drainDistributionCheckQueue(workerId: string) {
  await reconcileInterruptedDistributionCheckJobs();

  while (true) {
    const item = await claimNextDistributionCheckJob(workerId, distributionCheckQueueLockMs);
    if (!item) return;

    const runningJob = await saveDistributionCheckJobToDb({
      ...item,
      status: "running",
      lockedBy: workerId,
      startedAt: item.startedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const heartbeat = setInterval(() => {
      void heartbeatDistributionCheckJob(runningJob.id, workerId, distributionCheckQueueLockMs).catch((error) =>
        console.warn(`Distribution check heartbeat failed for ${runningJob.id}:`, error),
      );
    }, distributionCheckQueueHeartbeatMs);

    try {
      await executeDistributionCheckJob(runningJob, workerId);
    } catch (error) {
      const message = compactCliError(error);
      await saveTerminalDistributionCheckJob(runningJob, {
        status: "failed",
        error: message,
      });
      await recordExecutionLog({
        scope: "feishu/distribution-check",
        action: "Distribution check queue job failed",
        status: "error",
        message,
        details: {
          jobId: runningJob.id,
          ownerUserId: runningJob.ownerUserId,
          total: runningJob.total,
        },
        ownerUserId: runningJob.ownerUserId,
        ownerDisplayName: runningJob.ownerDisplayName,
      });
    } finally {
      clearInterval(heartbeat);
    }
  }
}

async function executeDistributionCheckJob(job: DistributionCheckJob, workerId: string) {
  const startedAt = Date.now();
  let workingJob: DistributionCheckJob = {
    ...job,
    status: "running",
    lockedBy: workerId,
    startedAt: job.startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveDistributionCheckJobToDb(workingJob);

  await recordExecutionLog({
    scope: "feishu/distribution-check",
    action: "Distribution check queue job started",
    status: "running",
    message: `Auditing ${job.numbers.length} Feishu record(s) from queued job ${job.id}.`,
    details: {
      jobId: job.id,
      total: job.numbers.length,
      ownerUserId: job.ownerUserId,
    },
    ownerUserId: job.ownerUserId,
    ownerDisplayName: job.ownerDisplayName,
  });

  let lastPersistAt = 0;
  const persistProgress = async (force = false) => {
    const now = Date.now();
    if (!force && workingJob.processed < workingJob.total && now - lastPersistAt < 1200 && workingJob.processed % 10 !== 0) return;
    lastPersistAt = now;
    const summary = buildDistributionSummary(workingJob.results, workingJob.total);
    workingJob = {
      ...workingJob,
      ...summary,
      status: "running",
      processed: Math.min(workingJob.processed, workingJob.total),
      lockedUntil: new Date(Date.now() + distributionCheckQueueLockMs).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveDistributionCheckJobToDb(workingJob);
  };

  const summary = await runDistributionCheckWorkflow(job.numbers, { prompt: job.prompt }, async (event) => {
    if (event.type === "processed") {
      workingJob = {
        ...workingJob,
        processed: Math.min(workingJob.processed + 1, workingJob.total),
        results: event.item ? upsertDistributionResult(workingJob.results, event.item) : workingJob.results,
      };
      await persistProgress();
      return;
    }

    workingJob = {
      ...workingJob,
      results: mergeDistributionResults(workingJob.results, event.items),
    };
    await persistProgress(true);
  });

  const terminalStatus = summary.updated === summary.total ? "completed" : summary.updated > 0 ? "partial" : "failed";
  const completedJob = await saveTerminalDistributionCheckJob(workingJob, {
    ...summary,
    status: terminalStatus,
    processed: job.numbers.length,
  });

  await recordExecutionLog({
    scope: "feishu/distribution-check",
    action: "Distribution check queue job completed",
    status: terminalStatus === "failed" ? "error" : terminalStatus === "partial" ? "info" : "success",
    message: `Distribution check job ${job.id} updated ${summary.updated}/${summary.total} Feishu record(s).`,
    durationMs: Date.now() - startedAt,
    details: {
      jobId: completedJob.id,
      queueStatus: completedJob.status,
      total: summary.total,
      updated: summary.updated,
      failed: summary.failed,
    },
    ownerUserId: job.ownerUserId,
    ownerDisplayName: job.ownerDisplayName,
  });
}

async function runDistributionCheckWorkflow(
  numbers: string[],
  options: DistributionCheckOptions = {},
  onProgress?: (event: DistributionProgressEvent) => Promise<void>,
): Promise<DistributionCheckResponse> {
  const fieldMap = getDistributionFieldMap();
  await assertDistributionFieldsReady(fieldMap);

  const processed = await mapWithConcurrency(numbers, concurrencyConfig.distributionRecord, async (number) => {
    const result = await processDistributionNumber(number, fieldMap, options);
    await onProgress?.({ type: "processed", item: "ready" in result ? undefined : result.item });
    return result;
  });

  const results = processed.filter((item): item is { item: DistributionCheckItemResult } => "item" in item).map((item) => item.item);
  const readyToUpdate = processed.filter((item): item is { ready: ReadyDistributionUpdate } => "ready" in item).map((item) => item.ready);
  const updateGroups = groupDistributionUpdates(readyToUpdate);
  const updatedGroups = await mapWithConcurrency(updateGroups, concurrencyConfig.distributionFeishuWrite, async (group) => {
    if (!group.length) return [] as DistributionCheckItemResult[];
    try {
      await updateDistributionRecords(group.map((item) => item.recordId), group[0].distribution, group[0].score.total, fieldMap);
      const items: DistributionCheckItemResult[] = group.map((item) => ({ ...item, status: "updated" }));
      await onProgress?.({ type: "updated", items });
      return items;
    } catch (error) {
      const items: DistributionCheckItemResult[] = group.map((item) => ({
        ...item,
        status: "failed",
        error: compactCliError(error),
      }));
      await onProgress?.({ type: "updated", items });
      return items;
    }
  });

  return buildDistributionSummary([...results, ...updatedGroups.flat()], numbers.length);
}

async function processDistributionNumber(
  number: string,
  fieldMap: DistributionFieldMap,
  options: DistributionCheckOptions,
): Promise<{ item: DistributionCheckItemResult } | { ready: ReadyDistributionUpdate }> {
  try {
    const record = isLikelyRecordId(number)
      ? await getDistributionRecord(number, number, fieldMap)
      : await findDistributionRecordByNumber(number, fieldMap);
    if (!record) {
      return {
        item: {
          number,
          status: "not_found",
          error: "No exact Feishu record matched this number.",
        },
      };
    }

    const assessment = await assessDistributionRecord(record, options);
    return {
      ready: {
        number,
        recordId: record.recordId,
        status: "updated",
        distribution: assessment.distribution,
        score: assessment.score,
        title: record.title,
        vehicle: record.vehicle,
        previousValue: record.previousValue,
        confidence: assessment.confidence,
        riskTags: assessment.riskTags,
        reasons: assessment.reasons,
      },
    };
  } catch (error) {
    return {
      item: {
        number,
        status: "failed",
        error: compactCliError(error),
      },
    };
  }
}

async function reconcileInterruptedDistributionCheckJobs() {
  const now = new Date();
  const nowIso = now.toISOString();
  if (distributionCheckQueueState.reconciledAt === nowIso) return;
  distributionCheckQueueState.reconciledAt = nowIso;

  const jobs = await readDistributionCheckJobsFromDb(100);
  const interruptedJobs = jobs.filter((job) => job.status === "running" && job.lockedUntil && Date.parse(job.lockedUntil) < now.getTime());
  for (const job of interruptedJobs) {
    const message = `Interrupted distribution check job: worker lease expired at ${job.lockedUntil}. Start a new audit job to retry unfinished records.`;
    await saveTerminalDistributionCheckJob(job, {
      status: job.updated > 0 ? "partial" : "failed",
      error: message,
    });
    await recordExecutionLog({
      scope: "feishu/distribution-check",
      action: "Interrupted distribution check job recovered",
      status: "error",
      message,
      details: {
        jobId: job.id,
        ownerUserId: job.ownerUserId,
      },
      ownerUserId: job.ownerUserId,
      ownerDisplayName: job.ownerDisplayName,
    });
  }
}

async function saveTerminalDistributionCheckJob(job: DistributionCheckJob, patch: Partial<DistributionCheckJob>) {
  const now = new Date().toISOString();
  const nextJob: DistributionCheckJob = {
    ...job,
    ...patch,
    lockedBy: undefined,
    lockedUntil: undefined,
    completedAt: now,
    updatedAt: now,
  };
  return saveDistributionCheckJobToDb(nextJob);
}

function assertDistributionConfigured() {
  if (!appConfig.feishuCliBin || !appConfig.feishuDistributionCheckBaseToken || !appConfig.feishuDistributionCheckTableId) {
    throw new Error("Distribution check needs FEISHU_CLI_BIN and Feishu Base table config.");
  }
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
    select_fields: [fieldMap.number, fieldMap.title, fieldMap.body, fieldMap.materials, fieldMap.vehicle, fieldMap.distribution, fieldMap.contentScore],
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
    fieldMap.contentScore,
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

async function updateDistributionRecords(recordIds: string[], decision: DistributionDecision, contentScore: number, fieldMap: DistributionFieldMap) {
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
            [fieldMap.contentScore]: contentScore,
          },
        }),
      ],
      120_000,
      "distributionFeishuWrite",
    );
  }
}

function groupDistributionUpdates(items: Array<DistributionCheckItemResult & { recordId: string; distribution: DistributionDecision; score: DistributionScore }>) {
  const groups = new Map<string, Array<DistributionCheckItemResult & { recordId: string; distribution: DistributionDecision; score: DistributionScore }>>();
  for (const item of items) {
    const key = `${item.distribution}:${item.score.total}`;
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

async function assessDistributionRecord(record: DistributionRecord, options: DistributionCheckOptions): Promise<DistributionAssessment> {
  const local = assessDistributionRecordLocally(record);
  if (local.distribution === "不可分发") return local;
  if (!appConfig.openaiApiKey) return local;

  try {
    const model = normalizeModelAssessment(await callDistributionModel(buildDistributionPrompt(record, local, options.prompt)), local.score);
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

  const score = scoreDistributionRecord(record, Array.from(new Set(riskTags)));
  const blocked = Boolean(riskTags.length);
  return {
    distribution: blocked ? "不可分发" : "可分发",
    confidence: blocked ? 0.82 : score.total >= 82 ? 0.72 : 0.62,
    score,
    riskTags: Array.from(new Set(riskTags)),
    reasons: reasons.length ? reasons.slice(0, 4) : ["未发现明显人设、隐私、素材或安全风险。"],
  };
}

function scoreDistributionRecord(record: DistributionRecord, hardRiskTags: string[]): DistributionScore {
  const text = [record.title, record.body].filter(Boolean).join("\n").trim();
  const hasPersonaRisk = hardRiskTags.some((tag) => tag === "人设口吻" || tag === "隐私风险");
  const hasSafetyRisk = hardRiskTags.some((tag) => tag === "安全风险" || tag === "竞品拉踩");
  const hasText = Boolean(text);
  const bodyLength = record.body.trim().length;
  const dimensions: DistributionScoreDimension[] = [
    {
      name: "去人设安全",
      score: hasPersonaRisk ? 4 : 30,
      max: 30,
      reason: hasPersonaRisk ? "存在个人身份、车主经历或隐私绑定信号。" : "未命中强个人身份或隐私绑定信号。",
    },
    {
      name: "素材可重构",
      score: record.materialCount >= 3 ? 20 : record.materialCount > 0 ? 14 : 0,
      max: 20,
      reason: record.materialCount >= 3 ? "素材数量较充足，可支撑跨账号重构。" : record.materialCount > 0 ? "有素材但数量偏少。" : "未识别到可用素材。",
    },
    {
      name: "内容通用性",
      score: !hasText ? 0 : hasPersonaRisk ? 6 : bodyLength >= 80 ? 20 : 14,
      max: 20,
      reason: !hasText ? "标题和正文为空。" : hasPersonaRisk ? "内容主题被个人叙事削弱。" : bodyLength >= 80 ? "正文信息量可支撑改写。" : "内容较短，改写空间有限。",
    },
    {
      name: "平台安全",
      score: hasSafetyRisk ? 3 : 15,
      max: 15,
      reason: hasSafetyRisk ? "存在强负面、攻击或竞品拉踩风险。" : "未命中强负面或竞品攻击表达。",
    },
    {
      name: "盲预测价值",
      score: scorePredictionValue(record, hasText, hardRiskTags),
      max: 15,
      reason: record.vehicle ? "车型信息明确，便于发布前预测和发布后复盘。" : "车型信息缺失，预测锚点不足。",
    },
  ];
  const rawTotal = dimensions.reduce((sum, item) => sum + item.score, 0);
  const cappedTotal = hardRiskTags.length ? Math.min(rawTotal, 59) : rawTotal;
  const total = Math.min(100, Math.max(0, Math.round(cappedTotal)));
  return {
    total,
    threshold: distributionScoreThreshold,
    prediction: scorePrediction(total),
    dimensions,
  };
}

function scorePredictionValue(record: DistributionRecord, hasText: boolean, hardRiskTags: string[]) {
  if (!hasText || hardRiskTags.length) return 3;
  let score = 7;
  if (record.vehicle) score += 4;
  if (record.title.trim().length >= 8) score += 2;
  if (record.materialCount >= 2) score += 2;
  return Math.min(score, 15);
}

async function callDistributionModel(prompt: string): Promise<ModelAssessmentJson> {
  const text =
    appConfig.openaiTextEndpoint === "chat"
      ? await callChatCompletions(prompt)
      : await callResponsesApi(prompt);
  return parseJsonObject(text) as ModelAssessmentJson;
}

async function callResponsesApi(prompt: string) {
  const response = await runWithConcurrencyPool("distributionGpt", () =>
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
  const response = await runWithConcurrencyPool("distributionGpt", () =>
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
    "请按 cheat-on-content README_CN 的“打分 -> 盲预测 -> 发布 -> T+3 天复盘 -> 进化评分公式”思路，先给发布前评分和盲预测，再做是否分发判断。",
    "只允许输出 JSON。",
    "distribution 只能是“可分发”或“不可分发”。不确定时必须输出“不可分发”。",
    "score 必须是 0-100 整数，并会写入飞书“内容评分”字段；score 不直接决定 distribution。",
    "prediction 只能是“高潜力”“可测试”或“低优先级”。",
    '输出 JSON 示例：{"distribution":"不可分发","score":42,"prediction":"低优先级","confidence":0.86,"riskTags":["人设口吻"],"reasons":["包含车主第一人称体验"]}',
    `本地初判: ${local.distribution}; 评分 ${local.score.total}/100; ${local.riskTags.join(",") || "无风险"}; ${local.reasons.join(" / ")}`,
    `编号: ${record.number}`,
    `车型: ${record.vehicle}`,
    `素材数量: ${record.materialCount}`,
    `标题: ${record.title}`,
    `正文: ${record.body.slice(0, 2400)}`,
  ].join("\n");
}

function normalizeModelAssessment(json: ModelAssessmentJson, fallbackScore: DistributionScore): DistributionAssessment {
  const modelScore = normalizeScore(json.score);
  const score = modelScore === undefined ? fallbackScore : buildModelDistributionScore(modelScore, json.prediction);
  const distribution = json.distribution === "可分发" ? "可分发" : "不可分发";
  return {
    distribution,
    confidence: normalizeConfidence(json.confidence) ?? (distribution === "可分发" ? 0.7 : 0.75),
    score,
    riskTags: arrayOfStrings(json.riskTags).slice(0, 6),
    reasons: arrayOfStrings(json.reasons).slice(0, 4),
  };
}

function mergeAssessments(local: DistributionAssessment, model: DistributionAssessment): DistributionAssessment {
  const score = model.score;
  if (local.distribution === "不可分发" || model.distribution === "不可分发") {
    return {
      distribution: "不可分发",
      confidence: Math.max(local.confidence, model.confidence),
      score,
      riskTags: Array.from(new Set([...local.riskTags, ...model.riskTags])),
      reasons: [...model.reasons, ...local.reasons].filter(Boolean).slice(0, 4),
    };
  }
  return {
    distribution: "可分发",
    confidence: Math.max(local.confidence, model.confidence),
    score,
    riskTags: [],
    reasons: (model.reasons.length ? model.reasons : local.reasons).slice(0, 4),
  };
}

function buildModelDistributionScore(score: number | undefined, prediction: unknown): DistributionScore {
  const total = score ?? 0;
  return {
    total,
    threshold: distributionScoreThreshold,
    prediction: normalizePrediction(prediction, total),
    dimensions: [
      {
        name: "模型总评",
        score: total,
        max: 100,
        reason: "模型按 cheat-on-content 发布前评分和盲预测流程给出的总分。",
      },
    ],
  };
}

function scorePrediction(total: number): DistributionScorePrediction {
  if (total >= 85) return "高潜力";
  if (total >= distributionScoreThreshold) return "可测试";
  return "低优先级";
}

function normalizePrediction(value: unknown, total: number): DistributionScorePrediction {
  return value === "高潜力" || value === "可测试" || value === "低优先级" ? value : scorePrediction(total);
}

async function runFeishuDistributionCli(args: string[], timeout: number, pool: Extract<ConcurrencyPoolName, "distributionFeishuRead" | "distributionFeishuWrite"> = "distributionFeishuRead"): Promise<CliResult> {
  const invocation = resolveFeishuCliInvocation(appConfig.feishuCliBin);
  return runWithConcurrencyPool(pool, async () => {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= feishuDistributionCliMaxAttempts; attempt += 1) {
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
        const sanitized = sanitizeCliError(error);
        lastError = sanitized;
        if (attempt >= feishuDistributionCliMaxAttempts || !isFeishuDistributionRateLimitError(sanitized)) throw sanitized;
        await sleep(feishuDistributionRetryDelayMs(attempt));
      }
    }
    throw lastError || new Error("Feishu distribution check CLI failed.");
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

function upsertDistributionResult(results: DistributionCheckItemResult[], item: DistributionCheckItemResult) {
  const next = results.filter((current) => current.number !== item.number);
  next.push(item);
  return next;
}

function mergeDistributionResults(results: DistributionCheckItemResult[], items: DistributionCheckItemResult[]) {
  return items.reduce((current, item) => upsertDistributionResult(current, item), results);
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

function normalizeScore(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(Math.max(Math.round(parsed), 0), 100);
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

function isFeishuDistributionRateLimitError(error: Error) {
  const message = error.message;
  return /800004135|99991400|OpenAPISearchRecord limited|OpenAPIBatchUpdateRecords limited|request trigger frequency limit|rate_limit/i.test(message);
}

function feishuDistributionRetryDelayMs(attempt: number) {
  const exponential = feishuDistributionCliBaseRetryDelayMs * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.floor(Math.random() * 350);
  return Math.min(exponential + jitter, 10_000);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function readBoundedIntegerEnv(envName: string, fallback: number, min: number, max: number) {
  const raw = process.env[envName];
  const value = raw === undefined || raw.trim() === "" ? fallback : Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), min), max);
}
