import { randomUUID } from "node:crypto";
import { appConfig, getConfigStatus, openaiImageRouteConfig } from "./config";
import { concurrencyConfig } from "./concurrency";
import {
  cancelOriginalBatchQueueItem,
  cancelOriginalBatchQueuedItems,
  claimNextOriginalBatchQueueItem,
  completeOriginalBatchQueueItem,
  createOriginalBatchRecords,
  failOriginalBatchQueueItem,
  failExpiredOriginalBatchQueueItems,
  getOriginalBatchFromDb,
  getOriginalBatchItemFromDb,
  heartbeatOriginalBatchQueueItem,
  listOriginalBatchItemsFromDb,
  listOriginalBatchesFromDb,
  requeueExpiredOriginalBatchQueueItemsWithProviderTasks,
  requeueOriginalBatchItem,
  saveOriginalBatchItemToDb,
  saveOriginalBatchToDb,
} from "./database";
import { getGeneratedPost, saveGeneratedPost } from "./generated-posts";
import { generateCanvasGptImages } from "./image-generation";
import { generateCoverAnchoredCards, isOriginalCardProviderPending } from "./original-card-orchestrator";
import { callOpenAIForJson, callOpenAIForVisionText } from "./openai";
import { normalizeContentTags } from "./source-tagging";
import { clampGeneratedTitleMax } from "./title-guard";
import { accessActorFromOwner } from "./workspace-ownership";
import type {
  GeneratedPost,
  OriginalBatch,
  OriginalBatchInputItem,
  OriginalBatchItem,
  OriginalBatchQueueItem,
  OriginalBatchSettings,
  OriginalBatchStatus,
  WorkspaceAccount,
  XhsCard,
  XhsCardSeries,
} from "./types";
import type { WorkspaceAccessActor } from "./workspace-ownership";
import { assertCanAccessWorkspaceRecord, filterWorkspaceOwnedRecords } from "./workspace-ownership";
import {
  XHS_CARD_SOURCE,
  assembleXhsCardPrompt,
  buildOriginalPlanningPrompt,
  buildOriginalWritingPrompt,
  buildXhsCardsFromWriting,
  buildXhsQaPrompt,
  defaultOriginalBatchSettings,
  isXhsLayout,
  isXhsPalette,
  isXhsStrategy,
  isXhsStyle,
  normalizeOriginalContentPlan,
  parseXhsQaResult,
  resolveXhsImageOptions,
} from "./xhs-card-series";

const originalBatchQueueLockMs = 10 * 60_000;
const originalBatchQueueHeartbeatMs = 60_000;
const originalBatchProviderPollDelayMs = 30_000;

export type OriginalBatchRowError = { row: number; field: "topic" | "requirements" | "vehicleKeyword"; message: string };
export type OriginalBatchValidation = {
  items: OriginalBatchInputItem[];
  settings: OriginalBatchSettings;
  errors: OriginalBatchRowError[];
  duplicateRows: number[];
};

export class OriginalBatchInputError extends Error {
  constructor(message: string, readonly errors: OriginalBatchRowError[] = []) {
    super(message);
    this.name = "OriginalBatchInputError";
  }
}

export function validateOriginalBatchInput(rawItems: unknown, rawSettings?: unknown): OriginalBatchValidation {
  if (!Array.isArray(rawItems)) throw new OriginalBatchInputError("items must be an array.");
  const items = rawItems
    .map((value) => normalizeInputRow(value))
    .filter((value): value is OriginalBatchInputItem => Boolean(value));
  if (items.length < 1 || items.length > 100) {
    throw new OriginalBatchInputError("A batch must contain 1 to 100 non-empty rows.");
  }

  const errors: OriginalBatchRowError[] = [];
  const seen = new Set<string>();
  const duplicateRows: number[] = [];
  items.forEach((item, index) => {
    const row = index + 1;
    if (!item.topic) errors.push({ row, field: "topic", message: "选题不能为空" });
    if (item.topic.length > 120) errors.push({ row, field: "topic", message: "选题最多 120 字" });
    if ((item.requirements?.length || 0) > 4_000) errors.push({ row, field: "requirements", message: "创作要求最多 4000 字" });
    if ((item.vehicleKeyword?.length || 0) > 96) errors.push({ row, field: "vehicleKeyword", message: "车型/关键词最多 96 字" });
    const fingerprint = JSON.stringify([item.topic, item.requirements || "", item.vehicleKeyword || ""]);
    if (seen.has(fingerprint)) duplicateRows.push(row);
    seen.add(fingerprint);
  });
  const settings = normalizeBatchSettings(rawSettings);
  if (errors.length) throw new OriginalBatchInputError("Batch validation failed.", errors);
  return { items, settings, errors, duplicateRows };
}

export function getOriginalBatchPreflight(itemCount: number, settings: OriginalBatchSettings) {
  const config = getConfigStatus();
  const profile = openaiImageRouteConfig("primary").profile;
  const imageOptions = resolveXhsImageOptions(profile);
  return {
    itemCount,
    maxImageRequests: itemCount * (settings.imageCount === "auto" ? 10 : settings.imageCount) * 2,
    expectedImageCount: settings.imageCount === "auto" ? { min: itemCount * 2, max: itemCount * 10 } : itemCount * settings.imageCount,
    effectiveRatio: imageOptions.effectiveRatio,
    imageSize: imageOptions.size,
    providerProfile: profile,
    textConfigured: config.openaiConfigured,
    imageConfigured: config.openaiImageConfigured,
    webSearchAvailable: appConfig.openaiTextEndpoint === "responses",
  };
}

export async function createOriginalBatch(
  input: { items: unknown; settings?: unknown },
  account: Pick<WorkspaceAccount, "id" | "displayName" | "role">,
) {
  const validation = validateOriginalBatchInput(input.items, input.settings);
  if (validation.settings.webSearch && appConfig.openaiTextEndpoint !== "responses") {
    throw new OriginalBatchInputError("联网检索需要 OPENAI_TEXT_ENDPOINT=responses。");
  }
  const now = new Date().toISOString();
  const batchId = `original-batch-${randomUUID()}`;
  const batch: OriginalBatch = {
    id: batchId,
    ownerUserId: account.id,
    ownerDisplayName: account.displayName || account.id,
    status: "queued",
    settings: validation.settings,
    counts: emptyCounts(validation.items.length),
    createdAt: now,
    updatedAt: now,
  };
  const items: OriginalBatchItem[] = validation.items.map((item, index) => ({
    id: `${batchId}-item-${String(index + 1).padStart(3, "0")}`,
    batchId,
    ownerUserId: batch.ownerUserId,
    ownerDisplayName: batch.ownerDisplayName,
    ordinal: index,
    status: "queued",
    input: item,
    createdAt: now,
    updatedAt: now,
  }));
  const queueItems: OriginalBatchQueueItem[] = items.map((item) => ({
    id: `original-queue-${randomUUID()}`,
    batchId,
    itemId: item.id,
    ownerUserId: batch.ownerUserId,
    status: "queued",
    priority: 0,
    attempts: 0,
    maxAttempts: 1,
    runAfter: now,
    createdAt: now,
    updatedAt: now,
  }));
  await createOriginalBatchRecords(batch, items, queueItems);
  ensureOriginalBatchWorker();
  return { batch: { ...batch, items }, duplicateRows: validation.duplicateRows, preflight: getOriginalBatchPreflight(items.length, validation.settings) };
}

export async function listOriginalBatches(
  account: WorkspaceAccessActor,
  options: { page?: number; pageSize?: number; status?: OriginalBatchStatus } = {},
) {
  const page = clampInteger(options.page, 1, 10_000, 1);
  const pageSize = clampInteger(options.pageSize, 1, 100, 20);
  const batches = filterWorkspaceOwnedRecords(await listOriginalBatchesFromDb(200, 0), account)
    .filter((batch) => !options.status || batch.status === options.status);
  const offset = (page - 1) * pageSize;
  return { batches: batches.slice(offset, offset + pageSize), page, pageSize, total: batches.length };
}

export async function getOriginalBatch(batchId: string, account: WorkspaceAccessActor) {
  const batch = await getOriginalBatchFromDb(batchId);
  assertCanAccessWorkspaceRecord(account, batch, "Original batch not found");
  return { ...batch, items: await listOriginalBatchItemsFromDb(batchId) };
}

export async function updateOriginalBatch(
  batchId: string,
  action: "pause" | "resume" | "cancel" | "retry_failed",
  account: WorkspaceAccessActor,
) {
  let batch = await getOriginalBatchFromDb(batchId);
  assertCanAccessWorkspaceRecord(account, batch, "Original batch not found");
  const items = await listOriginalBatchItemsFromDb(batchId);
  const now = new Date().toISOString();

  if (action === "pause") {
    if (!batch || !["queued", "running"].includes(batch.status)) throw new OriginalBatchInputError("Only queued or running batches can be paused.");
    batch = await saveOriginalBatchToDb({ ...batch, status: "paused", updatedAt: now });
  } else if (action === "resume") {
    if (!batch || batch.status !== "paused") throw new OriginalBatchInputError("Only paused batches can be resumed.");
    for (const item of items.filter((entry) => !isTerminalItem(entry))) await requeueOriginalBatchItem(item.id);
    batch = await saveOriginalBatchToDb({ ...batch, status: "queued", updatedAt: now, error: undefined });
    ensureOriginalBatchWorker();
  } else if (action === "cancel") {
    if (!batch || ["completed", "failed", "cancelled"].includes(batch.status)) throw new OriginalBatchInputError("This batch cannot be cancelled.");
    await cancelOriginalBatchQueuedItems(batchId);
    await Promise.all(items.filter((item) => item.status === "queued").map((item) => saveOriginalBatchItemToDb({ ...item, status: "cancelled", updatedAt: now, completedAt: now })));
    batch = await refreshOriginalBatch(batchId, "cancelled");
  } else {
    if (!batch || !["failed", "partial", "completed"].includes(batch.status)) throw new OriginalBatchInputError("Only terminal batches can retry failed items.");
    const failedItems = items.filter((item) => item.status === "failed");
    if (!failedItems.length) throw new OriginalBatchInputError("This batch has no failed items.");
    for (const item of failedItems) {
      await saveOriginalBatchItemToDb({ ...item, status: "queued", error: undefined, completedAt: undefined, updatedAt: now });
      await requeueOriginalBatchItem(item.id);
    }
    batch = await refreshOriginalBatch(batchId, "queued");
    ensureOriginalBatchWorker();
  }
  return getOriginalBatch(batch.id, account);
}

export async function regenerateOriginalSeriesCard(
  input: { postId: string; cardId: string; prompt?: string },
  account: WorkspaceAccessActor,
) {
  let post = await getGeneratedPost(input.postId, account);
  if (!post?.xhsSeries) throw new OriginalBatchInputError("Original series post not found.");
  const series = post.xhsSeries;
  const card = series.cards.find((entry) => entry.id === input.cardId);
  if (!card) throw new OriginalBatchInputError("Original series card not found.");
  const cover = series.cards[0];
  if (card.index > 0 && !cover?.imageUrl) throw new OriginalBatchInputError("Cover anchor is unavailable.");
  const imageOptions = resolveXhsImageOptions(openaiImageRouteConfig("primary").profile);
  const prompt = normalizeString(input.prompt) || card.prompt;
  let batchItem = post.sourceBatchItemId ? await getOriginalBatchItemFromDb(post.sourceBatchItemId) : undefined;
  const persistRegeneration = async (status: OriginalBatchItem["status"]) => {
    const now = new Date().toISOString();
    post = await saveGeneratedPost({
      ...post!,
      xhsSeries: series,
      imagePrompt: series.cards.map((entry) => entry.prompt).join("\n\n---\n\n"),
      imageUrls: series.cards.map((entry) => entry.imageUrl).filter((url): url is string => Boolean(url)),
      aiNotes: buildSeriesNotes(series),
      updatedAt: now,
    }, account);
    if (batchItem) {
      batchItem = await saveOriginalBatchItemToDb({
        ...batchItem,
        series,
        status,
        error: undefined,
        updatedAt: now,
        ...(status === "generating" ? { completedAt: undefined } : { completedAt: now }),
      });
    }
    return post;
  };

  card.prompt = prompt;
  card.status = "generating";
  card.error = undefined;
  const result = await generateCanvasGptImages(
    prompt,
    1,
    card.index > 0 ? [cover.imageUrl!] : [],
    { ...imageOptions, quality: "high" },
    {
      resumeTaskId: isOriginalCardProviderPending(card) ? card.providerTaskId : undefined,
      resumeTaskRoute: isOriginalCardProviderPending(card) ? card.providerTaskRoute : undefined,
      resumeStatus: isOriginalCardProviderPending(card) ? card.providerStatus : undefined,
      onTaskUpdate: async (state) => {
        card.providerTaskId = state.taskId;
        card.providerTaskRoute = state.route;
        card.providerStatus = state.status;
        await persistRegeneration("generating");
      },
    },
  );
  if (result.status === "pending" && result.providerTaskId) {
    card.providerTaskId = result.providerTaskId;
    card.providerTaskRoute = result.providerTaskRoute;
    card.providerStatus = result.providerStatus || "pending";
    card.status = "generating";
    const saved = await persistRegeneration("generating");
    if (batchItem) {
      await requeueOriginalBatchItem(batchItem.id, originalBatchProviderPollDelayMs);
      await refreshOriginalBatch(batchItem.batchId);
      setTimeout(ensureOriginalBatchWorker, originalBatchProviderPollDelayMs);
    }
    return { post: saved, card, pending: true };
  }
  if (result.status !== "completed" || !result.imageUrls[0]) {
    throw new Error(result.message || "Image provider did not return a completed card.");
  }
  card.candidateUrls = Array.from(new Set([...card.candidateUrls, result.imageUrls[0]]));
  card.imageUrl = result.imageUrls[0];
  if (card.providerTaskId) card.providerStatus = "completed";
  const qa = await qaCard(card);
  card.status = qa.passed ? "completed" : "needs_review";
  const itemStatus = series.cards.some((entry) => entry.status === "needs_review" || entry.status === "failed") ? "needs_review" : "completed";
  const saved = await persistRegeneration(itemStatus);
  if (batchItem) await refreshOriginalBatch(batchItem.batchId);
  return { post: saved, card };
}

type OriginalBatchWorkerState = typeof globalThis & { __fluxpostOriginalBatchWorker?: { activeWorkers: number; sequence: number } };
const workerState = ((globalThis as OriginalBatchWorkerState).__fluxpostOriginalBatchWorker ||= { activeWorkers: 0, sequence: 0 });

export function ensureOriginalBatchWorker() {
  while (workerState.activeWorkers < concurrencyConfig.originalBatch) {
    workerState.activeWorkers += 1;
    workerState.sequence += 1;
    const workerId = `original-worker-${process.pid}-${Date.now()}-${workerState.sequence}`;
    setTimeout(() => void drainOriginalBatchQueue(workerId).finally(() => {
      workerState.activeWorkers = Math.max(0, workerState.activeWorkers - 1);
    }), 0);
  }
}

async function drainOriginalBatchQueue(workerId: string) {
  await recoverExpiredOriginalBatchItems();
  while (true) {
    const queueItem = await claimNextOriginalBatchQueueItem(workerId, originalBatchQueueLockMs);
    if (!queueItem) return;
    const heartbeat = setInterval(() => void heartbeatOriginalBatchQueueItem(queueItem.id, workerId, originalBatchQueueLockMs)
      .catch((error) => console.warn(`Original batch heartbeat failed for ${queueItem.itemId}:`, error)), originalBatchQueueHeartbeatMs);
    try {
      await executeOriginalBatchItem(queueItem);
      await completeOriginalBatchQueueItem(queueItem.id, workerId);
    } catch (error) {
      if (error instanceof OriginalBatchProviderPendingError) {
        await requeueOriginalBatchItem(queueItem.itemId, originalBatchProviderPollDelayMs);
        setTimeout(ensureOriginalBatchWorker, originalBatchProviderPollDelayMs);
      } else if (error instanceof OriginalBatchControlError && error.action === "paused") {
        await requeueOriginalBatchItem(queueItem.itemId);
      } else if (error instanceof OriginalBatchControlError && error.action === "cancelled") {
        const item = await getOriginalBatchItemFromDb(queueItem.itemId);
        if (item && !isTerminalItem(item)) {
          const now = new Date().toISOString();
          await saveOriginalBatchItemToDb({ ...item, status: "cancelled", completedAt: now, updatedAt: now });
        }
        await cancelOriginalBatchQueueItem(queueItem.id, workerId);
      } else {
        const message = error instanceof Error ? error.message : "Original batch item failed.";
        const item = await getOriginalBatchItemFromDb(queueItem.itemId);
        if (item) await saveOriginalBatchItemToDb({ ...item, status: "failed", error: message, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        await failOriginalBatchQueueItem(queueItem.id, workerId, message);
      }
    } finally {
      clearInterval(heartbeat);
      await refreshOriginalBatch(queueItem.batchId);
    }
  }
}

async function executeOriginalBatchItem(queueItem: OriginalBatchQueueItem) {
  let item = await requireItem(queueItem.itemId);
  const batch = await assertBatchBoundary(item.batchId);
  item = await saveItemStage(item, "planning");
  if (!item.plan) {
    const planJson = await callOpenAIForJson(buildOriginalPlanningPrompt({ ...item.input, settings: batch.settings }), {
      webSearch: batch.settings.webSearch,
      logLabel: `原创批次策划 ${item.ordinal + 1}`,
    });
    item = await saveOriginalBatchItemToDb({ ...item, plan: normalizeOriginalContentPlan(planJson, batch.settings), updatedAt: new Date().toISOString() });
    await assertBatchBoundary(item.batchId);
  }

  item = await saveItemStage(item, "writing");
  let writing = item.writing;
  if (!writing) {
    writing = await callOpenAIForJson(buildOriginalWritingPrompt({ ...item.input, plan: item.plan! }), {
      logLabel: `原创批次文案 ${item.ordinal + 1}`,
    });
    if (!stringValue(writing.body, "")) throw new Error("The writing model returned an empty body.");
    item = await saveOriginalBatchItemToDb({ ...item, writing, updatedAt: new Date().toISOString() });
    await assertBatchBoundary(item.batchId);
  }
  const profile = openaiImageRouteConfig("primary").profile;
  const imageOptions = resolveXhsImageOptions(profile);
  let series = item.series;
  if (!series) {
    const cards = buildXhsCardsFromWriting(item.plan!, writing);
    cards.forEach((card) => {
      card.prompt = assembleXhsCardPrompt({
        card,
        total: cards.length,
        strategy: item.plan!.strategy,
        style: item.plan!.style,
        palette: item.plan!.palette,
      });
    });
    series = {
      schemaVersion: 1,
      source: XHS_CARD_SOURCE,
      strategy: item.plan!.strategy,
      style: item.plan!.style,
      defaultLayout: item.plan!.defaultLayout,
      palette: item.plan!.palette,
      effectiveRatio: imageOptions.effectiveRatio,
      cards,
    };
  }
  item = await saveOriginalBatchItemToDb({ ...item, status: "generating", series, updatedAt: new Date().toISOString() });

  const owner = accessActorFromOwner(item.ownerUserId, item.ownerDisplayName);
  let post = item.postId ? await getGeneratedPost(item.postId, owner) : undefined;
  if (!post) {
    post = buildGeneratedPost(item, writing, series);
    await saveGeneratedPost(post);
    item = await saveOriginalBatchItemToDb({ ...item, postId: post.id, updatedAt: new Date().toISOString() });
  }

  const generation = await generateCoverAnchoredCards(series.cards, {
    beforeStage: async () => { await assertBatchBoundary(item.batchId); },
    generate: async (prompt, references, card) => generateCanvasGptImages(
      prompt,
      1,
      references,
      { ...imageOptions, quality: "high" },
      {
        resumeTaskId: isOriginalCardProviderPending(card) ? card.providerTaskId : undefined,
        resumeTaskRoute: isOriginalCardProviderPending(card) ? card.providerTaskRoute : undefined,
        resumeStatus: isOriginalCardProviderPending(card) ? card.providerStatus : undefined,
        onTaskUpdate: async (state) => {
          card.providerTaskId = state.taskId;
          card.providerTaskRoute = state.route;
          card.providerStatus = state.status;
          await persistSeries(item, series, post);
        },
      },
    ),
    qa: async (card, imageUrl) => runCardQa(card, imageUrl),
    onUpdate: async () => { await persistSeries(item, series, post); },
  });
  await persistSeries(item, series, post);
  if (generation.pending) throw new OriginalBatchProviderPendingError();
  const hasFailed = series.cards.some((card) => card.status === "failed");
  const needsReview = series.cards.some((card) => card.status === "needs_review");
  const now = new Date().toISOString();
  await saveOriginalBatchItemToDb({
    ...item,
    series,
    status: hasFailed || needsReview ? "needs_review" : "completed",
    completedAt: now,
    updatedAt: now,
  });
}

async function recoverExpiredOriginalBatchItems() {
  await requeueExpiredOriginalBatchQueueItemsWithProviderTasks();
  const expired = await failExpiredOriginalBatchQueueItems();
  for (const entry of expired) {
    const item = await getOriginalBatchItemFromDb(entry.itemId);
    if (item && !isTerminalItem(item)) {
      const now = new Date().toISOString();
      await saveOriginalBatchItemToDb({ ...item, status: "failed", error: entry.error, completedAt: now, updatedAt: now });
    }
    await refreshOriginalBatch(entry.batchId);
  }
}

async function qaCard(card: XhsCard) {
  const result = await runCardQa(card, card.imageUrl!);
  card.qa = { status: result.unavailable ? "unavailable" : result.passed ? "passed" : "failed", attempts: card.qa.attempts + 1, issues: result.issues, checkedAt: new Date().toISOString() };
  return result;
}

async function runCardQa(card: XhsCard, imageUrl: string): Promise<{ passed: boolean; issues: string[]; unavailable?: boolean }> {
  try {
    const text = await callOpenAIForVisionText(buildXhsQaPrompt(card), [imageUrl], { logLabel: `小红书卡片 QA ${card.index + 1}` });
    const result = parseXhsQaResult(text);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "视觉 QA 不可用";
    return { passed: false, unavailable: true, issues: [message] };
  }
}

async function persistSeries(item: OriginalBatchItem, series: XhsCardSeries, post: GeneratedPost) {
  const now = new Date().toISOString();
  item.series = series;
  item.updatedAt = now;
  await saveOriginalBatchItemToDb(item);
  post.xhsSeries = series;
  post.imagePrompt = series.cards.map((card) => card.prompt).join("\n\n---\n\n");
  post.imageUrls = series.cards.map((card) => card.imageUrl).filter((url): url is string => Boolean(url));
  post.aiNotes = buildSeriesNotes(series);
  post.updatedAt = now;
  await saveGeneratedPost(post);
}

function buildGeneratedPost(item: OriginalBatchItem, writing: Record<string, unknown>, series: XhsCardSeries): GeneratedPost {
  const now = new Date().toISOString();
  return {
    id: `post-original-batch-${item.id}`,
    ownerUserId: item.ownerUserId,
    ownerDisplayName: item.ownerDisplayName,
    sourceItemId: `original-batch-item-${item.id}`,
    sourceBatchId: item.batchId,
    sourceBatchItemId: item.id,
    platform: "original",
    title: clampGeneratedTitleMax(stringValue(writing.title, item.input.topic)),
    body: stringValue(writing.body, ""),
    taskKeyword: item.input.vehicleKeyword || item.input.topic,
    feishuVehicle: item.input.vehicleKeyword || "",
    imagePrompt: series.cards.map((card) => card.prompt).join("\n\n---\n\n"),
    imageUrls: [],
    contentTags: normalizeContentTags(writing.contentTags),
    materialPaths: [],
    status: "draft",
    aiNotes: buildSeriesNotes(series),
    xhsSeries: series,
    createdAt: now,
    updatedAt: now,
  };
}

function buildSeriesNotes(series: XhsCardSeries) {
  const problems = series.cards.flatMap((card) => card.qa.issues.map((issue) => `第 ${card.index + 1} 张：${issue}`));
  return [`批量原创卡片：${series.style} / ${series.defaultLayout} / ${series.effectiveRatio}`, ...problems];
}

async function assertBatchBoundary(batchId: string) {
  const batch = await getOriginalBatchFromDb(batchId);
  if (!batch) throw new Error("Original batch not found.");
  if (batch.status === "paused") throw new OriginalBatchControlError("paused");
  if (batch.status === "cancelled") throw new OriginalBatchControlError("cancelled");
  if (batch.status === "queued") await saveOriginalBatchToDb({ ...batch, status: "running", updatedAt: new Date().toISOString() });
  return batch;
}

class OriginalBatchControlError extends Error {
  constructor(readonly action: "paused" | "cancelled") {
    super(`Original batch ${action}.`);
  }
}

class OriginalBatchProviderPendingError extends Error {
  constructor() {
    super("Original batch image provider task is pending.");
    this.name = "OriginalBatchProviderPendingError";
  }
}

async function saveItemStage(item: OriginalBatchItem, status: OriginalBatchItem["status"]) {
  await assertBatchBoundary(item.batchId);
  return saveOriginalBatchItemToDb({ ...item, status, error: undefined, updatedAt: new Date().toISOString() });
}

async function requireItem(itemId: string) {
  const item = await getOriginalBatchItemFromDb(itemId);
  if (!item) throw new Error("Original batch item not found.");
  return item;
}

async function refreshOriginalBatch(batchId: string, forcedStatus?: OriginalBatchStatus) {
  const batch = await getOriginalBatchFromDb(batchId);
  if (!batch) throw new Error("Original batch not found.");
  const items = await listOriginalBatchItemsFromDb(batchId);
  const counts = {
    total: items.length,
    queued: items.filter((item) => item.status === "queued").length,
    running: items.filter((item) => ["planning", "writing", "generating", "validating"].includes(item.status)).length,
    completed: items.filter((item) => item.status === "completed").length,
    needsReview: items.filter((item) => item.status === "needs_review").length,
    failed: items.filter((item) => item.status === "failed").length,
    cancelled: items.filter((item) => item.status === "cancelled").length,
  };
  const done = counts.completed + counts.needsReview + counts.failed + counts.cancelled === counts.total;
  const status = forcedStatus || (batch.status === "paused" || batch.status === "cancelled" ? batch.status : !done ? (counts.running ? "running" : "queued") : counts.failed === counts.total ? "failed" : counts.failed || counts.needsReview || counts.cancelled ? "partial" : "completed");
  const now = new Date().toISOString();
  return saveOriginalBatchToDb({ ...batch, status, counts, updatedAt: now, completedAt: done ? now : undefined });
}

function normalizeInputRow(value: unknown): OriginalBatchInputItem | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const topic = normalizeString(row.topic);
  const requirements = normalizeString(row.requirements);
  const vehicleKeyword = normalizeString(row.vehicleKeyword);
  if (!topic && !requirements && !vehicleKeyword) return undefined;
  return { topic, ...(requirements ? { requirements } : {}), ...(vehicleKeyword ? { vehicleKeyword } : {}) };
}

function normalizeBatchSettings(value: unknown): OriginalBatchSettings {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const imageCount = raw.imageCount === "auto" || raw.imageCount === undefined ? "auto" : Number(raw.imageCount);
  if (imageCount !== "auto" && (!Number.isInteger(imageCount) || imageCount < 2 || imageCount > 10)) {
    throw new OriginalBatchInputError("imageCount must be auto or an integer from 2 to 10.");
  }
  const strategy = raw.strategy === "auto" || raw.strategy === undefined ? "auto" : raw.strategy;
  const style = raw.style === "auto" || raw.style === undefined ? "auto" : raw.style;
  const layout = raw.layout === "auto" || raw.layout === undefined ? "auto" : raw.layout;
  const palette = raw.palette === "auto" || raw.palette === undefined ? "auto" : raw.palette;
  if (strategy !== "auto" && !isXhsStrategy(strategy)) throw new OriginalBatchInputError("Invalid strategy.");
  if (style !== "auto" && !isXhsStyle(style)) throw new OriginalBatchInputError("Invalid style.");
  if (layout !== "auto" && !isXhsLayout(layout)) throw new OriginalBatchInputError("Invalid layout.");
  if (palette !== "auto" && palette !== "default" && !isXhsPalette(palette)) throw new OriginalBatchInputError("Invalid palette.");
  return { ...defaultOriginalBatchSettings, strategy, style, layout, palette, imageCount, webSearch: raw.webSearch === true };
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function emptyCounts(total: number) {
  return { total, queued: total, running: 0, completed: 0, needsReview: 0, failed: 0, cancelled: 0 };
}

function isTerminalItem(item: OriginalBatchItem) {
  return ["completed", "needs_review", "failed", "cancelled"].includes(item.status);
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}
