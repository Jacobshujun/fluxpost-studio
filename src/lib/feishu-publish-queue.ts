import { randomUUID } from "node:crypto";
import { compactError, recordExecutionLog } from "./activity-log";
import { getSourceItemsByIds, markSourceRewritten } from "./content-pool";
import {
  claimNextFeishuPublishQueueItem,
  getFeishuPublishJobFromDb,
  getFeishuPublishQueueContextFromDb,
  getSimpleRunFromDb,
  heartbeatFeishuPublishQueueItem,
  readFeishuPublishJobsFromDb,
  saveFeishuPublishJobToDb,
  saveSimpleRunToDb,
} from "./database";
import { publishPostsToFeishu } from "./feishu-cli";
import { getGeneratedPost, saveGeneratedPost } from "./generated-posts";
import { resolveRuntimeMediaReference } from "./runtime-media-materializer";
import { savePost } from "./store";
import { accessActorFromOwner, filterWorkspaceOwnedRecords, type WorkspaceAccessActor } from "./workspace-ownership";
import type {
  FeishuPublishJob,
  FeishuPublishJobResult,
  FeishuPublishJobSource,
  FeishuPublishQueueStatus,
  GeneratedPost,
  SimpleRun,
  SimpleRunStage,
} from "./types";

type EnqueueFeishuPublishJobOptions = {
  ownerUserId?: string;
  ownerDisplayName?: string;
  source?: FeishuPublishJobSource;
  sourceRunId?: string;
  priority?: number;
};

const defaultOwnerUserId = "local";
const feishuPublishQueueWorkerConcurrency = readBoundedIntegerEnv("FEISHU_PUBLISH_WORKER_CONCURRENCY", 1, 1, 5);
const feishuPublishQueueLockMs = 10 * 60_000;
const feishuPublishQueueHeartbeatMs = 30_000;
const feishuPublishPersistMaxAttempts = 3;
const feishuPublishPersistRetryDelayMs = 300;

type FeishuPublishQueueGlobalState = typeof globalThis & {
  __fluxpostFeishuPublishQueue?: {
    activeWorkers: number;
    sequence: number;
    reconciledAt?: string;
  };
};

const feishuPublishQueueState = ((globalThis as FeishuPublishQueueGlobalState).__fluxpostFeishuPublishQueue ||= {
  activeWorkers: 0,
  sequence: 0,
});

export async function enqueueFeishuPublishJob(posts: GeneratedPost[], options: EnqueueFeishuPublishJobOptions = {}) {
  const ownerUserId = (options.ownerUserId || defaultOwnerUserId).trim() || defaultOwnerUserId;
  const publishPosts = normalizePosts(await enrichPostsWithContentTags(posts));
  if (!publishPosts.length) throw new Error("At least one post is required to enqueue Feishu publishing.");

  const approvedPosts = publishPosts.map((post) => ({
    ...post,
    status: "approved" as const,
    updatedAt: new Date().toISOString(),
  }));
  await persistPostsForFeishuQueue(approvedPosts);

  const source = options.source || "manual";
  const postIds = approvedPosts.map((post) => post.id);
  const existingJob = await findEquivalentQueuedJob(ownerUserId, postIds);
  if (existingJob) {
    ensureFeishuPublishQueueWorker();
    return existingJob;
  }

  const now = new Date().toISOString();
  const job: FeishuPublishJob = {
    id: `feishu-publish-${Date.now()}-${randomUUID().slice(0, 8)}`,
    ownerUserId,
    source,
    sourceRunId: options.sourceRunId,
    status: "queued",
    priority: Number(options.priority || 0),
    attempts: 0,
    maxAttempts: 1,
    runAfter: now,
    createdAt: now,
    updatedAt: now,
    postIds,
    posts: approvedPosts,
  };

  await saveFeishuPublishJobToDb(job);
  await recordExecutionLog({
    scope: "publish/feishu",
    action: "Feishu publish queued",
    status: "info",
    message: `Queued Feishu publish job ${job.id} for ${postIds.length} post(s).`,
    details: {
      jobId: job.id,
      ownerUserId,
      source,
      sourceRunId: options.sourceRunId || null,
      postCount: postIds.length,
    },
  });
  ensureFeishuPublishQueueWorker();
  return job;
}

export async function listFeishuPublishJobs(limit = 50, account?: WorkspaceAccessActor) {
  await reconcileInterruptedFeishuPublishJobs();
  ensureFeishuPublishQueueWorker();
  return filterWorkspaceOwnedRecords(await readFeishuPublishJobsFromDb(limit), account);
}

export async function getFeishuPublishJob(jobId: string, account?: WorkspaceAccessActor) {
  await reconcileInterruptedFeishuPublishJobs();
  ensureFeishuPublishQueueWorker();
  const job = await getFeishuPublishJobFromDb(jobId);
  if (!job || (account && !filterWorkspaceOwnedRecords([job], account).length)) return undefined;
  return job;
}

export function ensureFeishuPublishQueueWorker() {
  while (feishuPublishQueueState.activeWorkers < feishuPublishQueueWorkerConcurrency) {
    feishuPublishQueueState.activeWorkers += 1;
    feishuPublishQueueState.sequence += 1;
    const workerId = `feishu-publish-worker-${process.pid}-${Date.now()}-${feishuPublishQueueState.sequence}`;
    setTimeout(() => {
      void drainFeishuPublishQueue(workerId).finally(() => {
        feishuPublishQueueState.activeWorkers = Math.max(0, feishuPublishQueueState.activeWorkers - 1);
      });
    }, 0);
  }
}

export async function buildFeishuPublishJobResponse(job: FeishuPublishJob) {
  const queueContext = await getFeishuPublishQueueContextFromDb(job.id);
  const queueMessage =
    job.status === "queued" && queueContext.queueAhead > 0
      ? `Feishu publish job ${job.id} is waiting behind ${queueContext.queueAhead} same-user job(s).${
          queueContext.activeJobId ? ` Active job: ${queueContext.activeJobId}.` : ""
        }`
      : undefined;
  return {
    status: responseStatusFromJob(job),
    jobId: job.id,
    queueStatus: job.status,
    job,
    payloadPath: job.result?.payloadPath,
    message: job.result?.message || job.error || queueMessage,
    queueAhead: queueContext.queueAhead,
    activeJobId: queueContext.activeJobId,
    notification: job.result?.notificationStatus ? { status: job.result.notificationStatus } : undefined,
  };
}

async function drainFeishuPublishQueue(workerId: string) {
  await reconcileInterruptedFeishuPublishJobs();

  while (true) {
    const item = await claimNextFeishuPublishQueueItem(workerId, feishuPublishQueueLockMs);
    if (!item) return;

    let runningJob = await saveFeishuPublishJobToDb({
      ...item,
      status: "running",
      lockedBy: workerId,
      startedAt: item.startedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const heartbeat = setInterval(() => {
      void heartbeatFeishuPublishQueueItem(runningJob.id, workerId, feishuPublishQueueLockMs).catch((error) =>
        console.warn(`Feishu publish queue heartbeat failed for ${runningJob.id}:`, error),
      );
    }, feishuPublishQueueHeartbeatMs);

    try {
      const preparation = await prepareFeishuPublishJobMedia(runningJob);
      runningJob = preparation.job;
      await executeFeishuPublishJob(runningJob, preparation.mediaRepairCount);
    } catch (error) {
      const message = compactError(error);
      const failedJob = await saveTerminalFeishuJob(runningJob, {
        status: "failed",
        result: {
          status: "failed",
          message,
        },
        error: message,
      });
      await syncSimpleRunPublishJob(failedJob);
      await recordExecutionLog({
        scope: "publish/feishu",
        action: "Feishu publish queue job failed",
        status: "error",
        message,
        details: {
          jobId: failedJob.id,
          ownerUserId: failedJob.ownerUserId,
          postCount: failedJob.postIds.length,
        },
      });
    } finally {
      clearInterval(heartbeat);
    }
  }
}

async function executeFeishuPublishJob(job: FeishuPublishJob, mediaRepairCount: number) {
  const startedAt = Date.now();
  await recordExecutionLog({
    scope: "publish/feishu",
    action: "Feishu publish queue job started",
    status: "running",
    message: `Writing ${job.postIds.length} post(s) to Feishu from queued job ${job.id}.`,
    details: {
      jobId: job.id,
      ownerUserId: job.ownerUserId,
      source: job.source,
      sourceRunId: job.sourceRunId || null,
      postCount: job.postIds.length,
    },
  });

  const latestPosts = job.posts;
  const publishResult = await publishPostsToFeishu(latestPosts, {
    notificationContext: {
      jobId: job.id,
      source: job.source,
      sourceRunId: job.sourceRunId,
      ownerUserId: job.ownerUserId,
      ownerDisplayName: latestPosts.find((post) => post.ownerDisplayName?.trim())?.ownerDisplayName,
    },
  });
  const finalPosts = await persistPublishedPosts(latestPosts, publishResult);
  const jobResult = buildJobResult(publishResult, mediaRepairCount);
  const terminalStatus = queueStatusFromPublishResult(jobResult.status);
  const completedJob = await saveTerminalFeishuJob(job, {
    status: terminalStatus,
    posts: finalPosts,
    result: jobResult,
  });
  await syncSimpleRunPublishJob(completedJob);

  await recordExecutionLog({
    scope: "publish/feishu",
    action: "Feishu publish queue job completed",
    status: terminalStatus === "completed" ? "success" : terminalStatus === "failed" ? "error" : "info",
    message: jobResult.message || `Feishu publish job returned ${jobResult.status}.`,
    durationMs: Date.now() - startedAt,
    details: {
      jobId: completedJob.id,
      queueStatus: terminalStatus,
      publishStatus: jobResult.status,
      postCount: completedJob.postIds.length,
      recordCount: jobResult.recordCount || 0,
      attachmentFailureCount: jobResult.attachmentFailureCount || 0,
    },
  });

  return completedJob;
}

async function persistPublishedPosts(
  posts: GeneratedPost[],
  publishResult: Awaited<ReturnType<typeof publishPostsToFeishu>>,
) {
  const feishuStateByPostId = new Map((publishResult.postStates || []).map((item) => [item.postId, item.feishu]));
  const now = new Date().toISOString();
  const finalPosts = posts.map((post) => {
    const feishu = feishuStateByPostId.get(post.id) || post.feishu;
    return {
      ...post,
      feishu,
      status: isPostFullyPublished(post, feishu) ? ("published" as const) : ("approved" as const),
      updatedAt: now,
    };
  });

  await persistPostsSerially(finalPosts);
  return finalPosts;
}

async function persistPostsForFeishuQueue(posts: GeneratedPost[]) {
  await persistPostsSerially(posts);
}

async function persistPostsSerially(posts: GeneratedPost[]) {
  for (const post of posts) {
    await withFeishuPublishTransientDatabaseRetry(() => persistOnePost(post));
  }
}

async function persistOnePost(post: GeneratedPost) {
  await savePost(post);
  await saveGeneratedPost(post);
  await markSourceRewritten(post.sourceItemId, post);
}

async function withFeishuPublishTransientDatabaseRetry(operation: () => Promise<void>) {
  for (let attempt = 1; attempt <= feishuPublishPersistMaxAttempts; attempt += 1) {
    try {
      await operation();
      return;
    } catch (error) {
      if (attempt >= feishuPublishPersistMaxAttempts || !isFeishuPublishTransientDatabaseError(error)) throw error;
      await delayFeishuPublishPersistRetry(attempt);
    }
  }
}

function isFeishuPublishTransientDatabaseError(error: unknown) {
  const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "";
  const message = error instanceof Error ? error.message : String(error || "");
  return (
    code === "40P01" ||
    code === "40001" ||
    /\bdeadlock\b/i.test(message) ||
    message.includes("\u6b7b\u9501") ||
    /timeout exceeded when trying to connect/i.test(message)
  );
}

function delayFeishuPublishPersistRetry(attempt: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, feishuPublishPersistRetryDelayMs * attempt));
}

async function loadLatestPostsForJob(job: FeishuPublishJob) {
  const simpleRun = job.sourceRunId ? await getSimpleRunFromDb(job.sourceRunId) : undefined;
  const latestPosts = await Promise.all(
    job.posts.map(async (post) => {
      const latest = await getGeneratedPost(post.id);
      return latest || post;
    }),
  );
  return latestPosts.map((post) => ({
    ...post,
    taskKeyword: post.taskKeyword || simpleRun?.input.keyword,
    status: "approved" as const,
    updatedAt: new Date().toISOString(),
  }));
}

async function prepareFeishuPublishJobMedia(job: FeishuPublishJob) {
  const latestPosts = await loadLatestPostsForJob(job);
  let mediaRepairCount = 0;
  const repairedPosts: GeneratedPost[] = [];

  for (const post of latestPosts) {
    const repairedImages = await repairRuntimeMediaReferences(post.imageUrls, () => {
      mediaRepairCount += 1;
    });
    const repairedVideos = await repairRuntimeMediaReferences(post.videoUrls || [], () => {
      mediaRepairCount += 1;
    });
    repairedPosts.push({
      ...post,
      imageUrls: repairedImages,
      videoUrls: repairedVideos.length ? repairedVideos : post.videoUrls,
    });
  }

  const changedPosts = repairedPosts.filter((post, index) => post !== latestPosts[index] && hasMediaReferenceChanges(latestPosts[index], post));
  if (changedPosts.length) await persistRecoveredPostsSerially(changedPosts);

  const preparedJob = await saveFeishuPublishJobToDb({
    ...job,
    posts: repairedPosts,
    postIds: repairedPosts.map((post) => post.id),
    updatedAt: new Date().toISOString(),
  });

  if (mediaRepairCount > 0) {
    await recordExecutionLog({
      scope: "publish/feishu",
      action: "Feishu publish media references recovered",
      status: "info",
      message: `Recovered ${mediaRepairCount} historical runtime media reference(s) from verified TOS objects.`,
      details: {
        jobId: job.id,
        ownerUserId: job.ownerUserId,
        postCount: changedPosts.length,
        mediaRepairCount,
      },
    });
  }

  return { job: preparedJob, mediaRepairCount };
}

async function repairRuntimeMediaReferences(urls: string[], onRepair: () => void) {
  const repaired: string[] = [];
  for (const url of urls) {
    try {
      const resolved = await resolveRuntimeMediaReference(url);
      repaired.push(resolved.url);
      if (resolved.recoveredFromTos) onRepair();
    } catch {
      repaired.push(url);
    }
  }
  return repaired;
}

async function persistRecoveredPostsSerially(posts: GeneratedPost[]) {
  for (const post of posts) {
    await withFeishuPublishTransientDatabaseRetry(async () => {
      await savePost(post);
      await saveGeneratedPost(post);
    });
  }
}

function hasMediaReferenceChanges(previous: GeneratedPost, next: GeneratedPost) {
  return previous.imageUrls.join("\n") !== next.imageUrls.join("\n") || (previous.videoUrls || []).join("\n") !== (next.videoUrls || []).join("\n");
}

async function enrichPostsWithContentTags(posts: GeneratedPost[]) {
  return Promise.all(
    posts.map(async (post) => {
      if (post.contentTags?.length) return post;
      const source = (await getSourceItemsByIds([post.sourceItemId], accessActorFromOwner(post.ownerUserId, post.ownerDisplayName)))[0];
      return {
        ...post,
        contentTags: source?.contentTagging?.tags || [],
      };
    }),
  );
}

async function findEquivalentQueuedJob(ownerUserId: string, postIds: string[]) {
  const sortedPostIds = sortIds(postIds);
  const jobs = await readFeishuPublishJobsFromDb(100);
  return jobs.find((job) => {
    if (job.ownerUserId !== ownerUserId) return false;
    if (job.status !== "queued" && job.status !== "running") return false;
    return sortIds(job.postIds).join("\n") === sortedPostIds.join("\n");
  });
}

function normalizePosts(posts: GeneratedPost[]) {
  const byId = new Map<string, GeneratedPost>();
  posts.forEach((post) => {
    if (!post?.id) return;
    byId.set(post.id, post);
  });
  return Array.from(byId.values());
}

function buildJobResult(
  publishResult: Awaited<ReturnType<typeof publishPostsToFeishu>>,
  mediaRepairCount: number,
): FeishuPublishJobResult {
  return {
    status: publishResult.status,
    payloadPath: publishResult.payloadPath,
    message: publishResult.message,
    notificationStatus: publishResult.notification?.status,
    recordFailureCount: publishResult.recordFailures?.length || 0,
    attachmentFailureCount: publishResult.attachmentFailures?.length || 0,
    recordCount: publishResult.recordMappings?.length || 0,
    mediaRepairCount,
    mediaFailureCount: publishResult.mediaFailures?.length || 0,
    mediaFailures: publishResult.mediaFailures,
  };
}

function queueStatusFromPublishResult(status: FeishuPublishJobResult["status"]): FeishuPublishQueueStatus {
  if (status === "published") return "completed";
  if (status === "record_failed") return "partial";
  if (status === "attachment_failed") return "partial";
  if (status === "needs_config") return "needs_config";
  return status === "skipped" ? "cancelled" : "failed";
}

async function saveTerminalFeishuJob(
  job: FeishuPublishJob,
  patch: Partial<Pick<FeishuPublishJob, "status" | "posts" | "result" | "error">>,
) {
  const now = new Date().toISOString();
  return saveFeishuPublishJobToDb({
    ...job,
    ...patch,
    postIds: (patch.posts || job.posts).map((post) => post.id),
    lockedBy: undefined,
    lockedUntil: undefined,
    completedAt: now,
    updatedAt: now,
  });
}

async function syncSimpleRunPublishJob(job: FeishuPublishJob) {
  if (!job.sourceRunId) return;
  const run = await getSimpleRunFromDb(job.sourceRunId);
  if (!run || isForceTerminatedSimpleRun(run)) return;

  const now = new Date().toISOString();
  const publishStatus = publishStatusFromJob(job);
  const publishStage = buildSimpleRunPublishStage(run, job, now);
  const message = job.result?.message || job.error || `Feishu publish job ${job.id} returned ${job.status}.`;
  const nextErrors =
    publishStatus === "record_failed" || publishStatus === "attachment_failed" || publishStatus === "failed"
      ? appendUnique(run.errors, message)
      : run.errors;

  const nextRun: SimpleRun = {
    ...run,
    status: resolveSimpleRunStatusAfterFeishu(run, publishStatus, nextErrors),
    posts: run.posts.map((post) =>
      job.postIds.includes(post.postId)
        ? {
            ...post,
            status: job.posts.find((jobPost) => jobPost.id === post.postId)?.status || "approved",
          }
        : post,
    ),
    publish: {
      status: publishStatus,
      postCount: job.postIds.length,
      jobId: job.id,
      payloadPath: job.result?.payloadPath,
      message,
      notificationStatus: job.result?.notificationStatus,
      error: publishStatus === "failed" ? job.error || message : undefined,
    },
    stages: run.stages.map((stage) => (stage.id === "publish" ? publishStage : stage)),
    errors: nextErrors,
    completedAt: run.completedAt || now,
    updatedAt: now,
  };

  await saveSimpleRunToDb(nextRun);
}

function buildSimpleRunPublishStage(run: SimpleRun, job: FeishuPublishJob, now: string): SimpleRunStage {
  const current = run.stages.find((stage) => stage.id === "publish");
  const base = current || {
    id: "publish" as const,
    title: "鍐欏叆椋炰功",
    status: "queued" as const,
    total: job.postIds.length,
    completed: 0,
    failed: 0,
    skipped: 0,
    updatedAt: now,
  };
  const publishStatus = publishStatusFromJob(job);
  const message = job.result?.message || job.error || `Feishu publish job ${job.id} returned ${job.status}.`;

  if (publishStatus === "published") {
    return {
      ...base,
      status: "success",
      total: job.postIds.length,
      completed: job.postIds.length,
      failed: 0,
      message,
      updatedAt: now,
    };
  }

  if (publishStatus === "attachment_failed") {
    const completed = job.posts.filter((post) => post.status === "published").length;
    return {
      ...base,
      status: "warning",
      total: job.postIds.length,
      completed,
      failed: Math.max(1, job.postIds.length - completed),
      message,
      updatedAt: now,
    };
  }

  if (publishStatus === "record_failed") {
    return {
      ...base,
      status: "warning",
      total: job.postIds.length,
      completed: Math.max(0, (job.result?.recordCount || job.postIds.length) - (job.result?.recordFailureCount || 1)),
      failed: job.result?.recordFailureCount || 1,
      message,
      updatedAt: now,
    };
  }

  if (publishStatus === "needs_config") {
    return {
      ...base,
      status: "warning",
      total: job.postIds.length,
      completed: 0,
      failed: 0,
      skipped: job.postIds.length,
      message,
      updatedAt: now,
    };
  }

  return {
    ...base,
    status: "error",
    total: job.postIds.length,
    completed: 0,
    failed: job.postIds.length,
    message,
    updatedAt: now,
  };
}

async function reconcileInterruptedFeishuPublishJobs() {
  const now = new Date();
  const nowIso = now.toISOString();
  if (feishuPublishQueueState.reconciledAt === nowIso) return;
  feishuPublishQueueState.reconciledAt = nowIso;

  const jobs = await readFeishuPublishJobsFromDb(100);
  const interruptedJobs = jobs.filter((job) => job.status === "running" && job.lockedUntil && Date.parse(job.lockedUntil) < now.getTime());
  for (const job of interruptedJobs) {
    const message = `Interrupted Feishu publish job: worker lease expired at ${job.lockedUntil}. Retry manually to avoid accidental duplicate Base records.`;
    const failedJob = await saveTerminalFeishuJob(job, {
      status: "failed",
      result: {
        status: "failed",
        message,
      },
      error: message,
    });
    await syncSimpleRunPublishJob(failedJob);
    await recordExecutionLog({
      scope: "publish/feishu",
      action: "Interrupted Feishu publish job recovered",
      status: "error",
      message,
      details: {
        jobId: failedJob.id,
        ownerUserId: failedJob.ownerUserId,
      },
    });
  }
}

function publishStatusFromJob(job: FeishuPublishJob): NonNullable<SimpleRun["publish"]>["status"] {
  if (job.result?.status) return job.result.status;
  if (job.status === "queued") return "queued";
  if (job.status === "running") return "running";
  if (job.status === "completed") return "published";
  if (job.status === "partial") return "attachment_failed";
  if (job.status === "needs_config") return "needs_config";
  return "failed";
}

function responseStatusFromJob(job: FeishuPublishJob) {
  const status = publishStatusFromJob(job);
  if (status === "queued" || status === "running") return status;
  return status;
}

function resolveSimpleRunStatusAfterFeishu(
  run: SimpleRun,
  publishStatus: NonNullable<SimpleRun["publish"]>["status"],
  errors: string[],
): SimpleRun["status"] {
  if (!run.posts.length) return "failed";
  if (publishStatus === "published" && !errors.length) return "completed";
  return "partial";
}

function isForceTerminatedSimpleRun(run: SimpleRun) {
  return run.errors.some((error) => error.includes("寮哄埗缁堟") || /force terminated/i.test(error));
}

function appendUnique(values: string[], value: string) {
  return values.includes(value) ? values : [...values, value];
}

function isPostFullyPublished(post: GeneratedPost, feishu?: GeneratedPost["feishu"]) {
  if (feishu?.recordStatus !== "verified") return false;
  const mediaCount = post.imageUrls.length + (post.videoUrls?.length || 0);
  return mediaCount === 0 ? feishu.attachmentStatus === "skipped" : feishu.attachmentStatus === "uploaded";
}

function sortIds(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}

function readBoundedIntegerEnv(envName: string, fallback: number, min: number, max: number) {
  const raw = process.env[envName];
  const value = raw === undefined || raw.trim() === "" ? fallback : Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), min), max);
}
