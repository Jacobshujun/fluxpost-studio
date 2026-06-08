import { compactError, recordExecutionLog } from "./activity-log";
import { concurrencyConfig, mapWithConcurrency, runWithConcurrencyPool } from "./concurrency";
import { getSourceItemsByIds, markSourceRewritten } from "./content-pool";
import { readBatchJobsFromDb, writeBatchJobsToDb } from "./database";
import { saveGeneratedPost } from "./generated-posts";
import { generatePost } from "./openai";
import { buildProductionPlan } from "./production-plan";
import { savePost } from "./store";
import type { BatchProductionJob, BatchProductionStatus, NormalizedSourceItem, ProductionTask } from "./types";

type StoredBatchProduction = {
  jobs: BatchProductionJob[];
};

type CreateBatchProductionInput = {
  title?: string;
  sourceItemIds: string[];
  materialPaths: string[];
  instruction?: string;
};

const maxBatchItems = 30;

export async function listBatchProductionJobs() {
  const store = await readBatchProduction();
  return store.jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createAndRunBatchProduction(input: CreateBatchProductionInput) {
  const startedAt = Date.now();
  const sourceItemIds = Array.from(new Set(input.sourceItemIds.filter(Boolean))).slice(0, maxBatchItems);
  if (!sourceItemIds.length) throw new Error("请选择至少一条内容进入批量制作");

  const sources = await getSourceItemsByIds(sourceItemIds);
  if (!sources.length) throw new Error("未在内容池中找到选中的内容");

  const now = new Date().toISOString();
  const job = refreshJobStats({
    id: `batch-${Date.now()}`,
    title: input.title?.trim() || `批量制作 ${sources.length} 条内容`,
    status: "queued",
    instruction: input.instruction?.trim() || "",
    materialPaths: input.materialPaths.filter(Boolean),
    sourceItemIds,
    createdAt: now,
    updatedAt: now,
    totalTasks: sources.length,
    completedTasks: 0,
    failedTasks: 0,
    skippedTasks: 0,
    tasks: sources.map((source) => makeTask(source, now)),
  });

  await saveBatchJob(job);
  await recordExecutionLog({
    scope: "batch-production",
    action: "创建批量制作任务",
    status: "running",
    message: `已创建 ${job.tasks.length} 条逐条制作任务`,
    details: {
      jobId: job.id,
      taskCount: job.tasks.length,
      materialCount: job.materialPaths.length,
    },
  });

  let runningJob = await updateJob(job.id, { status: "running", updatedAt: new Date().toISOString() });
  const jobUpdates = createBatchJobUpdateQueue(runningJob);

  await mapWithConcurrency(runningJob.tasks, concurrencyConfig.production, async (task) =>
    runWithConcurrencyPool("production", async () => {
    const source = sources.find((item) => item.id === task.sourceItemId);
    if (!source) {
      await jobUpdates.update((latestJob) => updateTask(latestJob.id, task.id, {
        status: "failed",
        error: "内容池中找不到该来源内容",
        completedAt: new Date().toISOString(),
      }));
      return;
    }

    const plan = source.productionPlan || buildProductionPlan(source);
    if (plan.decision === "observe_only") {
      await jobUpdates.update((latestJob) => updateTask(latestJob.id, task.id, {
        status: "skipped",
        error: plan.reason,
        completedAt: new Date().toISOString(),
      }));
      await recordExecutionLog({
        scope: "batch-production",
        action: "跳过仅观察内容",
        status: "info",
        message: plan.reason,
        details: {
          jobId: runningJob.id,
          sourceItemId: source.id,
        },
      });
      return;
    }

    await jobUpdates.update((latestJob) => updateTask(latestJob.id, task.id, {
      status: "running",
      startedAt: new Date().toISOString(),
    }));

    try {
      const post = await generatePost({
        source,
        materialPaths: job.materialPaths,
        instruction: buildBatchInstruction(source, job.instruction),
      });
      await savePost(post);
      await saveGeneratedPost(post);
      await markSourceRewritten(post.sourceItemId, post);
      await jobUpdates.update((latestJob) => updateTask(latestJob.id, task.id, {
        status: "completed",
        postId: post.id,
        post,
        completedAt: new Date().toISOString(),
      }));
      await recordExecutionLog({
        scope: "batch-production",
        action: "单条批量草稿完成",
        status: "success",
        message: post.title,
        details: {
          jobId: runningJob.id,
          postId: post.id,
          sourceItemId: source.id,
        },
      });
    } catch (error) {
      await jobUpdates.update((latestJob) => updateTask(latestJob.id, task.id, {
        status: "failed",
        error: compactError(error),
        completedAt: new Date().toISOString(),
      }));
      await recordExecutionLog({
        scope: "batch-production",
        action: "单条批量草稿失败",
        status: "error",
        message: compactError(error),
        details: {
          jobId: runningJob.id,
          sourceItemId: source.id,
        },
      });
    }
    }),
  );
  runningJob = jobUpdates.current();

  const finalJob = await finishJob(runningJob.id);
  await recordExecutionLog({
    scope: "batch-production",
    action: "批量制作任务完成",
    status: finalJob.failedTasks ? "info" : "success",
    message: `完成 ${finalJob.completedTasks} 条，失败 ${finalJob.failedTasks} 条，跳过 ${finalJob.skippedTasks} 条`,
    durationMs: Date.now() - startedAt,
    details: {
      jobId: finalJob.id,
      completedTasks: finalJob.completedTasks,
      failedTasks: finalJob.failedTasks,
      skippedTasks: finalJob.skippedTasks,
    },
  });
  return finalJob;
}

function makeTask(source: NormalizedSourceItem, now: string): ProductionTask {
  const plan = source.productionPlan || buildProductionPlan(source);
  return {
    id: `task-${source.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sourceItemId: source.id,
    sourceTitle: source.title || source.contentText?.slice(0, 42),
    platform: source.platform,
    status: "queued",
    contentDirection: plan.contentDirection,
    decision: plan.decision,
    reason: plan.reason,
    updatedAt: now,
  };
}

function buildBatchInstruction(source: NormalizedSourceItem, baseInstruction: string) {
  const plan = source.productionPlan || buildProductionPlan(source);
  return [
    baseInstruction || "批量制作：逐条学习当前内容的信息结构、网感语气和画面策略，生成可审查图文草稿。",
    "批量模式要求：每条内容独立分析，不复用上一条内容的标题句式和正文结构。",
    `当前内容方向：${plan.contentDirection}`,
    `当前制作决策：${plan.decision}`,
    `当前策略原因：${plan.reason}`,
  ].join("\n");
}

async function finishJob(jobId: string) {
  const store = await readBatchProduction();
  const job = store.jobs.find((item) => item.id === jobId);
  if (!job) throw new Error("批量任务不存在");
  const refreshed = refreshJobStats({
    ...job,
    status: resolveJobStatus(job),
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await writeBatchProduction({
    jobs: store.jobs.map((item) => (item.id === jobId ? refreshed : item)),
  });
  return refreshed;
}

function resolveJobStatus(job: BatchProductionJob): BatchProductionStatus {
  const hasFailed = job.tasks.some((task) => task.status === "failed");
  const hasCompleted = job.tasks.some((task) => task.status === "completed");
  const allTerminal = job.tasks.every((task) => ["completed", "failed", "skipped"].includes(task.status));
  if (!allTerminal) return "running";
  if (hasFailed && hasCompleted) return "partial";
  if (hasFailed && !hasCompleted) return "failed";
  return "completed";
}

async function saveBatchJob(job: BatchProductionJob) {
  const store = await readBatchProduction();
  await writeBatchProduction({ jobs: [job, ...store.jobs.filter((item) => item.id !== job.id)].slice(0, 40) });
  return job;
}

async function updateJob(jobId: string, patch: Partial<BatchProductionJob>) {
  const store = await readBatchProduction();
  const job = store.jobs.find((item) => item.id === jobId);
  if (!job) throw new Error("批量任务不存在");
  const nextJob = refreshJobStats({ ...job, ...patch, updatedAt: patch.updatedAt || new Date().toISOString() });
  await writeBatchProduction({ jobs: store.jobs.map((item) => (item.id === jobId ? nextJob : item)) });
  return nextJob;
}

async function updateTask(jobId: string, taskId: string, patch: Partial<ProductionTask>) {
  const store = await readBatchProduction();
  const job = store.jobs.find((item) => item.id === jobId);
  if (!job) throw new Error("批量任务不存在");
  const nextJob = refreshJobStats({
    ...job,
    tasks: job.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            ...patch,
            updatedAt: new Date().toISOString(),
          }
        : task,
    ),
    updatedAt: new Date().toISOString(),
  });
  await writeBatchProduction({ jobs: store.jobs.map((item) => (item.id === jobId ? nextJob : item)) });
  return nextJob;
}

function refreshJobStats(job: BatchProductionJob): BatchProductionJob {
  return {
    ...job,
    totalTasks: job.tasks.length,
    completedTasks: job.tasks.filter((task) => task.status === "completed").length,
    failedTasks: job.tasks.filter((task) => task.status === "failed").length,
    skippedTasks: job.tasks.filter((task) => task.status === "skipped").length,
  };
}

async function readBatchProduction(): Promise<StoredBatchProduction> {
  return { jobs: await readBatchJobsFromDb() };
}

async function writeBatchProduction(store: StoredBatchProduction) {
  await writeBatchJobsToDb(store.jobs);
}

function createBatchJobUpdateQueue(initialJob: BatchProductionJob) {
  let currentJob = initialJob;
  let queue = Promise.resolve();

  return {
    current: () => currentJob,
    async update(updater: (latestJob: BatchProductionJob) => Promise<BatchProductionJob>) {
      const next = queue.then(async () => {
        currentJob = await updater(currentJob);
        return currentJob;
      });
      queue = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
  };
}
