import { randomUUID } from "node:crypto";
import {
  claimNextLibraryTaggingJob,
  getLibraryAssetFromDb,
  listLibraryTaggingJobsFromDb,
  saveLibraryAssetToDb,
  saveLibraryTaggingJobToDb,
} from "./database";
import { makeLibraryTaggingJob } from "./library-assets";
import { buildLibraryTaggingPrompt, mergeLibraryTagProfile, normalizeLibraryTagProfile } from "./library-tags";
import { callTaggingModel } from "./source-tagging";
import { appConfig } from "./config";
import type { LibraryTaggingJob } from "./types";
import { isWorkspaceAdmin, type WorkspaceAccessActor } from "./workspace-ownership";

const workerId = `library-worker-${process.pid}-${randomUUID().slice(0, 8)}`;
let draining = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

export async function listLibraryTaggingJobs(account: WorkspaceAccessActor, limit = 100) {
  return listLibraryTaggingJobsFromDb(isWorkspaceAdmin(account) ? undefined : account.id, Math.min(200, Math.max(1, limit)));
}

export async function enqueueLibraryTagging(account: WorkspaceAccessActor, assetIds: string[], mode: "failed" | "all" = "failed") {
  const uniqueIds = Array.from(new Set(assetIds)).slice(0, 200);
  const jobs: LibraryTaggingJob[] = [];
  for (const assetId of uniqueIds) {
    const asset = await getLibraryAssetFromDb(assetId);
    if (!asset || (!isWorkspaceAdmin(account) && asset.ownerUserId !== account.id)) continue;
    if (!asset.roles.includes("reference")) continue;
    if (mode === "failed" && asset.taggingStatus !== "failed") continue;
    const now = new Date().toISOString();
    const job = makeLibraryTaggingJob(asset, now);
    await saveLibraryAssetToDb({ ...asset, taggingStatus: "queued", taggingError: undefined, updatedAt: now });
    await saveLibraryTaggingJobToDb(job);
    jobs.push(job);
  }
  kickLibraryTaggingWorker();
  return jobs;
}

export function kickLibraryTaggingWorker() {
  if (draining) return;
  queueMicrotask(() => void drainLibraryTaggingQueue());
}

async function drainLibraryTaggingQueue() {
  if (draining) return;
  draining = true;
  if (retryTimer) clearTimeout(retryTimer);
  try {
    for (;;) {
      const job = await claimNextLibraryTaggingJob(workerId);
      if (!job) break;
      await processJob(job);
    }
  } finally {
    draining = false;
  }
}

async function processJob(job: LibraryTaggingJob) {
  const asset = await getLibraryAssetFromDb(job.assetId);
  if (!asset) {
    await finishJob(job, "failed", "Library asset no longer exists.");
    return;
  }
  if (!asset.roles.includes("reference")) {
    await finishIneligibleJob(job, asset);
    return;
  }
  const now = new Date().toISOString();
  await saveLibraryAssetToDb({ ...asset, taggingStatus: "running", taggingError: undefined, updatedAt: now });
  try {
    const eligible = await getLibraryAssetFromDb(asset.id);
    if (!eligible) {
      await finishJob(job, "failed", "Library asset no longer exists.");
      return;
    }
    if (!eligible.roles.includes("reference")) {
      await finishIneligibleJob(job, eligible);
      return;
    }
    const response = await callTaggingModel(
      buildLibraryTaggingPrompt(eligible.name),
      [{ id: eligible.id, imageUrl: eligible.publicUrl }],
      appConfig.openaiLibraryTaggingModel,
    );
    const taggedAt = new Date().toISOString();
    const aiTags = normalizeLibraryTagProfile(response, { model: appConfig.openaiLibraryTaggingModel, taggedAt });
    const current = await getLibraryAssetFromDb(asset.id);
    if (!current) {
      await finishJob(job, "failed", "Library asset no longer exists.");
      return;
    }
    if (!current.roles.includes("reference")) {
      await finishIneligibleJob(job, current);
      return;
    }
    await saveLibraryAssetToDb({
      ...current,
      aiTags,
      effectiveTags: mergeLibraryTagProfile(aiTags, current.manualOverrides),
      taggingStatus: "completed",
      taggingError: undefined,
      updatedAt: taggedAt,
    });
    await finishJob(job, "completed");
  } catch (error) {
    const message = sanitizeTaggingError(error);
    const current = await getLibraryAssetFromDb(asset.id);
    if (!current) {
      await finishJob(job, "failed", "Library asset no longer exists.");
      return;
    }
    if (!current.roles.includes("reference")) {
      await finishIneligibleJob(job, current);
      return;
    }
    const retry = isTransientTaggingError(error) && job.attempts < job.maxAttempts;
    const failedAt = new Date();
    await saveLibraryAssetToDb({
      ...current,
      taggingStatus: retry ? "queued" : "failed",
      taggingError: message,
      updatedAt: failedAt.toISOString(),
    });
    if (retry) {
      const delay = Math.min(30_000, 1_000 * 2 ** Math.max(0, job.attempts - 1));
      await saveLibraryTaggingJobToDb({
        ...job,
        status: "queued",
        runAfter: new Date(failedAt.getTime() + delay).toISOString(),
        lockedBy: undefined,
        lockedUntil: undefined,
        error: message,
        updatedAt: failedAt.toISOString(),
      });
      retryTimer = setTimeout(kickLibraryTaggingWorker, delay + 25);
    } else {
      await finishJob(job, "failed", message);
    }
  }
}

async function finishIneligibleJob(job: LibraryTaggingJob, asset: Awaited<ReturnType<typeof getLibraryAssetFromDb>>) {
  if (asset && !asset.roles.includes("reference")) {
    await saveLibraryAssetToDb({
      ...asset,
      taggingStatus: "completed",
      taggingError: undefined,
      updatedAt: new Date().toISOString(),
    });
  }
  await finishJob(job, "completed");
}

async function finishJob(job: LibraryTaggingJob, status: "completed" | "failed", error?: string) {
  const now = new Date().toISOString();
  await saveLibraryTaggingJobToDb({
    ...job,
    status,
    error,
    lockedBy: undefined,
    lockedUntil: undefined,
    updatedAt: now,
    completedAt: now,
  });
}

function isTransientTaggingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(408|409|429|5\d\d)\b|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|temporar/i.test(message);
}

function sanitizeTaggingError(error: unknown) {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of [appConfig.openaiApiKey]) if (secret) message = message.replaceAll(secret, "***");
  return message.slice(0, 500);
}
