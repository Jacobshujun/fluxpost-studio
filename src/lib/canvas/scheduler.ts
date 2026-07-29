import { createHash, randomUUID } from "node:crypto";
import {
  createCanvasScheduleInDb,
  deferCanvasRunQueueItems,
  deleteCanvasScheduleFromDb,
  getCanvasRunFromDb,
  getCanvasScheduleFromDb,
  launchCanvasScheduleInDb,
  listCanvasNodeRunsFromDb,
  listCanvasSchedulesFromDb,
  updateCanvasScheduleInDb,
} from "../database";
import { getGeneratedPost, updateGeneratedPost } from "../generated-posts";
import { listCopyLibraryEntries } from "../copy-library";
import { listLibraryAssets } from "../library-assets";
import type { CopyLibraryEntry, LibraryAsset, LibraryAssetRole } from "../types";
import {
  assertCanAccessWorkspaceRecord,
  canAccessWorkspaceOwner,
  filterWorkspaceOwnedRecords,
  scopeWorkspaceOwner,
  type WorkspaceAccessActor,
} from "../workspace-ownership";
import { buildCanvasRunPlan } from "./graph";
import { getCanvasNodeExecutionMode } from "./registry";
import {
  cancelCanvasRun,
  createCanvasRunFromGraph,
  ensureCanvasRunWorker,
  getCanvasRun,
  prepareCanvasRunFromGraph,
  retryCanvasNode,
} from "./runs";
import type {
  CanvasArtifact,
  CanvasGraph,
  CanvasNode,
  CanvasPromptStrategy,
  CanvasRun,
  CanvasSchedule,
  CanvasScheduleAssetFilter,
  CanvasScheduleAssetSnapshot,
  CanvasScheduleBatch,
  CanvasScheduleBindings,
  CanvasScheduleContentTask,
  CanvasScheduleCopyFilter,
  CanvasScheduleCopySnapshot,
  CanvasScheduleImageTask,
  CanvasScheduleStatus,
  CanvasSchedulerRole,
} from "./types";
import { CANVAS_REQUIRED_SCHEDULER_ROLES, CANVAS_SCHEDULER_ROLES, CANVAS_SCHEDULER_ROLE_LABELS } from "./types";
import { getCanvasWorkflow } from "./workflows";

const maxScheduleBatches = 20;
const maxImageTasks = 2_000;
const maxScenesPerBatch = 500;
const maxVehiclesPerContent = 16;
const terminalRunStatuses = new Set(["completed", "partial", "failed", "cancelled"]);
const mutableScheduleStatuses = new Set<CanvasScheduleStatus>(["draft", "ready"]);

type ScheduleBatchDraft = Pick<CanvasScheduleBatch,
  "id" | "name" | "strategy" | "sceneFilter" | "sceneCount" | "vehicleFilter" | "vehicleCountMin" | "vehicleCountMax" | "copyFilter"
>;

type SchedulerGlobalState = typeof globalThis & {
  __fluxpostCanvasScheduler?: { active: boolean; sequence: number };
};

const schedulerState = ((globalThis as SchedulerGlobalState).__fluxpostCanvasScheduler ||= { active: false, sequence: 0 });

export class CanvasScheduleRevisionConflictError extends Error {
  constructor() {
    super("This batch schedule changed in another tab. Refresh it before saving again.");
    this.name = "CanvasScheduleRevisionConflictError";
  }
}

export async function listCanvasSchedules(account: WorkspaceAccessActor) {
  await reconcileCanvasSchedules();
  kickCanvasSchedulerWorker();
  return filterWorkspaceOwnedRecords(await listCanvasSchedulesFromDb(), account).map(normalizeStoredSchedule);
}

export async function getCanvasSchedule(scheduleId: string, account: WorkspaceAccessActor) {
  await reconcileCanvasSchedules([scheduleId]);
  const schedule = await getCanvasScheduleFromDb(scheduleId);
  return schedule && canAccessWorkspaceOwner(account, schedule.ownerUserId) ? normalizeStoredSchedule(schedule) : undefined;
}

export async function createCanvasSchedule(account: WorkspaceAccessActor, input: { workflowId: string; name?: string }) {
  const workflow = await getCanvasWorkflow(input.workflowId, account);
  if (!workflow) throw new Error("Canvas workflow not found");
  const now = new Date().toISOString();
  const schedule: CanvasSchedule = {
    id: `canvas-schedule-${Date.now()}-${randomUUID().slice(0, 8)}`,
    ...scopeWorkspaceOwner(account),
    name: normalizeName(input.name, `${workflow.name} 批量任务`),
    revision: 1,
    workflowId: workflow.id,
    workflowRevision: workflow.revision,
    status: "draft",
    batches: [newScheduleBatch(now, 1)],
    totalContentTasks: 0,
    totalImageTasks: 0,
    createdAt: now,
    updatedAt: now,
  };
  return createCanvasScheduleInDb(schedule);
}

export async function updateCanvasScheduleDraft(
  scheduleId: string,
  account: WorkspaceAccessActor,
  input: { revision: number; name?: string; batches?: ScheduleBatchDraft[] },
) {
  const current = await requireSchedule(scheduleId, account);
  if (!mutableScheduleStatuses.has(current.status)) throw new Error("Launched schedules are immutable. Duplicate this schedule to edit it.");
  assertRevision(current, input.revision);
  const now = new Date().toISOString();
  const batches = input.batches === undefined
    ? current.batches.map(stripBatchRuntime)
    : normalizeBatches(input.batches, current.batches, now);
  const next: CanvasSchedule = {
    ...current,
    name: input.name === undefined ? current.name : normalizeName(input.name, current.name),
    revision: current.revision + 1,
    status: "draft",
    batches,
    bindings: undefined,
    previewRevision: undefined,
    workflowSnapshot: undefined,
    totalContentTasks: 0,
    totalImageTasks: 0,
    error: undefined,
    updatedAt: now,
  };
  await saveUpdatedSchedule(next, current.revision);
  return next;
}

export async function preflightCanvasSchedule(scheduleId: string, account: WorkspaceAccessActor, revision: number) {
  const current = await requireSchedule(scheduleId, account);
  if (!mutableScheduleStatuses.has(current.status)) throw new Error("Only draft schedules can be previewed.");
  assertRevision(current, revision);
  const workflow = await requireScheduleWorkflow(current, account, true);
  const usesCopyLibrary = current.batches.some((batch) => batch.copyFilter !== undefined);
  const bindings = validateCanvasSchedulerBindings(workflow.graph, usesCopyLibrary);
  const now = new Date().toISOString();
  const batches: CanvasScheduleBatch[] = [];
  let totalImageTasks = 0;
  for (const batch of current.batches) {
    const scenePool = await resolveScheduleAssetPool(account, "reference", batch.sceneFilter);
    const vehiclePool = await resolveScheduleAssetPool(account, "vehicle", batch.vehicleFilter);
    const copyPool = batch.copyFilter ? await resolveScheduleCopyPool(account, batch.copyFilter) : undefined;
    const scenes = batch.sceneFilter.mode === "manual"
      ? scenePool
      : sampleCanvasAssets(scenePool, batch.sceneCount);
    if (!scenes.length) throw new Error(`${batch.name}: 场景素材池为空。`);
    const copies = copyPool ? assignCanvasScheduleCopies(copyPool, scenes.length, batch.name) : undefined;
    if (batch.vehicleCountMax > vehiclePool.length) {
      throw new Error(`${batch.name}: 车型素材池只有 ${vehiclePool.length} 张，无法满足最多 ${batch.vehicleCountMax} 张的不重复抽样。`);
    }
    const contentTasks = scenes.map((scene, index) => makeContentTask(scene, vehiclePool, batch, now, undefined, copies?.[index]));
    totalImageTasks += contentTasks.reduce((sum, task) => sum + task.imageTasks.length, 0);
    if (totalImageTasks > maxImageTasks) throw new Error(`本次调度包含 ${totalImageTasks} 个图片子任务，超过 V1 上限 ${maxImageTasks}。`);
    batches.push({ ...stripBatchRuntime(batch), status: "ready", contentTasks, updatedAt: now });
  }
  const next: CanvasSchedule = {
    ...current,
    revision: current.revision + 1,
    workflowRevision: workflow.revision,
    status: "ready",
    batches,
    bindings,
    previewRevision: previewFingerprint(batches),
    totalContentTasks: batches.reduce((sum, batch) => sum + batch.contentTasks.length, 0),
    totalImageTasks,
    error: undefined,
    updatedAt: now,
  };
  await saveUpdatedSchedule(next, current.revision);
  return next;
}

export async function resampleCanvasSchedule(
  scheduleId: string,
  account: WorkspaceAccessActor,
  input: { revision: number; batchId: string; contentTaskId?: string },
) {
  const current = await requireSchedule(scheduleId, account);
  if (current.status !== "ready") throw new Error("Run preflight before resampling.");
  assertRevision(current, input.revision);
  const batch = current.batches.find((item) => item.id === input.batchId);
  if (!batch) throw new Error("Batch not found");
  const vehiclePool = await resolveScheduleAssetPool(account, "vehicle", batch.vehicleFilter);
  if (batch.vehicleCountMax > vehiclePool.length) throw new Error(`${batch.name}: 车型素材池数量不足。`);
  const copies = !input.contentTaskId && batch.copyFilter
    ? assignCanvasScheduleCopies(await resolveScheduleCopyPool(account, batch.copyFilter), batch.contentTasks.length, batch.name)
    : undefined;
  const now = new Date().toISOString();
  let foundContent = !input.contentTaskId;
  const batches = current.batches.map((item) => item.id !== batch.id ? item : {
    ...item,
    contentTasks: item.contentTasks.map((task, index) => {
      if (input.contentTaskId && task.id !== input.contentTaskId) return task;
      foundContent = true;
      return makeContentTask(task.scene, vehiclePool, item, now, task.id, input.contentTaskId ? task.copy : copies?.[index]);
    }),
    updatedAt: now,
  });
  if (!foundContent) throw new Error("Content task not found");
  const totalImageTasks = batches.reduce((sum, item) => sum + item.contentTasks.reduce((taskSum, task) => taskSum + task.imageTasks.length, 0), 0);
  if (totalImageTasks > maxImageTasks) throw new Error(`本次调度超过 ${maxImageTasks} 个图片子任务。`);
  const next: CanvasSchedule = {
    ...current,
    revision: current.revision + 1,
    batches,
    previewRevision: previewFingerprint(batches),
    totalImageTasks,
    updatedAt: now,
  };
  await saveUpdatedSchedule(next, current.revision);
  return next;
}

export async function launchCanvasSchedule(
  scheduleId: string,
  account: WorkspaceAccessActor,
  input: { revision: number; previewRevision: string },
) {
  const current = await requireSchedule(scheduleId, account);
  if (current.status !== "ready" || !current.previewRevision) throw new Error("Run preflight before launching this schedule.");
  assertRevision(current, input.revision);
  if (input.previewRevision !== current.previewRevision) throw new Error("The sampling preview changed. Review it again before launch.");
  const workflow = await requireScheduleWorkflow(current, account);
  const bindings = validateCanvasSchedulerBindings(workflow.graph, current.batches.some((batch) => batch.copyFilter !== undefined));
  if (stableSerialize(bindings) !== stableSerialize(current.bindings)) throw new Error("Canvas scheduler bindings changed after preflight.");
  await assertFrozenAssetsStillAvailable(current, account);

  const now = new Date().toISOString();
  let sequence = 0;
  const batches = current.batches.map((batch) => ({
    ...batch,
    status: "queued" as const,
    contentTasks: batch.contentTasks.map((content) => ({
      ...content,
      status: "queued" as const,
      imageTasks: content.imageTasks.map((imageTask) => ({
        ...imageTask,
        status: "queued" as const,
        runId: imageRunId(imageTask.id),
        updatedAt: now,
      })),
      updatedAt: now,
    })),
    updatedAt: now,
  }));
  const next: CanvasSchedule = {
    ...current,
    revision: current.revision + 1,
    status: "queued",
    batches,
    bindings,
    workflowSnapshot: structuredClone(workflow.graph),
    launchedAt: now,
    completedAt: undefined,
    error: undefined,
    updatedAt: now,
  };
  const runs: CanvasRun[] = [];
  for (const entry of roundRobinImageTasks(next)) {
    const createdAt = new Date(Date.parse(now) + sequence++).toISOString();
    runs.push(prepareCanvasRunFromGraph({
      id: entry.imageTask.runId || imageRunId(entry.imageTask.id),
      workflow,
      graph: createSchedulerImageGraph(workflow.graph, bindings, entry.batch.strategy, entry.content.scene, entry.imageTask.vehicle),
      targetNodeIds: [bindings["image-target"]],
      batchContext: {
        scheduleId: next.id,
        batchId: entry.batch.id,
        contentTaskId: entry.content.id,
        imageTaskId: entry.imageTask.id,
        phase: "image",
      },
      createdAt,
    }));
  }
  try {
    await launchCanvasScheduleInDb(next, current.revision, runs);
  } catch (error) {
    if (error instanceof Error && error.message === "Canvas schedule revision conflict") throw new CanvasScheduleRevisionConflictError();
    throw error;
  }
  ensureCanvasRunWorker();
  kickCanvasSchedulerWorker();
  return next;
}

export async function duplicateCanvasSchedule(scheduleId: string, account: WorkspaceAccessActor) {
  const source = await requireSchedule(scheduleId, account);
  const workflow = await getCanvasWorkflow(source.workflowId, account);
  if (!workflow) throw new Error("Canvas workflow not found");
  const now = new Date().toISOString();
  const schedule: CanvasSchedule = {
    id: `canvas-schedule-${Date.now()}-${randomUUID().slice(0, 8)}`,
    ...scopeWorkspaceOwner(account),
    name: normalizeName(`${source.name} 副本`, "批量任务副本"),
    revision: 1,
    workflowId: workflow.id,
    workflowRevision: workflow.revision,
    status: "draft",
    batches: source.batches.map((batch, index) => ({
      ...stripBatchRuntime(batch),
      id: `canvas-batch-${randomUUID()}`,
      name: batch.name || `批次 ${index + 1}`,
      createdAt: now,
      updatedAt: now,
    })),
    totalContentTasks: 0,
    totalImageTasks: 0,
    createdAt: now,
    updatedAt: now,
  };
  return createCanvasScheduleInDb(schedule);
}

export async function deleteCanvasSchedule(scheduleId: string, account: WorkspaceAccessActor) {
  const current = await requireSchedule(scheduleId, account);
  if (!mutableScheduleStatuses.has(current.status)) throw new Error("Only draft schedules can be deleted.");
  if (!(await deleteCanvasScheduleFromDb(current.id, current.ownerUserId))) throw new Error("Canvas schedule not found");
}

export async function setCanvasSchedulePaused(scheduleId: string, account: WorkspaceAccessActor, paused: boolean) {
  const current = await requireSchedule(scheduleId, account);
  if (paused && !["queued", "running"].includes(current.status)) throw new Error("Only active schedules can be paused.");
  if (!paused && current.status !== "paused") throw new Error("Only paused schedules can be resumed.");
  const now = new Date().toISOString();
  const next: CanvasSchedule = {
    ...current,
    revision: current.revision + 1,
    status: paused ? "paused" : "running",
    updatedAt: now,
  };
  await saveUpdatedSchedule(next, current.revision);
  await deferCanvasRunQueueItems(scheduleRunIds(next), paused);
  if (!paused) {
    ensureCanvasRunWorker();
    kickCanvasSchedulerWorker();
  }
  return next;
}

export async function cancelCanvasSchedule(scheduleId: string, account: WorkspaceAccessActor) {
  const current = await requireSchedule(scheduleId, account);
  if (!["queued", "running", "paused"].includes(current.status)) throw new Error("Only active schedules can be cancelled.");
  const now = new Date().toISOString();
  const next: CanvasSchedule = {
    ...current,
    revision: current.revision + 1,
    status: "cancelled",
    batches: current.batches.map((batch) => ({
      ...batch,
      status: "cancelled",
      contentTasks: batch.contentTasks.map((content) => ({
        ...content,
        status: terminalRunStatuses.has(content.status) ? content.status : "cancelled",
        imageTasks: content.imageTasks.map((task) => ({
          ...task,
          status: terminalRunStatuses.has(task.status) ? task.status : "cancelled",
          updatedAt: now,
        })),
        updatedAt: now,
      })),
      updatedAt: now,
    })),
    completedAt: now,
    updatedAt: now,
  };
  await saveUpdatedSchedule(next, current.revision);
  for (const runId of scheduleRunIds(current)) {
    await cancelCanvasRun(runId, ownerActor(current)).catch(() => undefined);
  }
  return next;
}

export async function retryCanvasScheduleImageTask(
  scheduleId: string,
  account: WorkspaceAccessActor,
  input: { batchId: string; contentTaskId: string; imageTaskId: string },
) {
  const current = await requireSchedule(scheduleId, account);
  const batch = current.batches.find((item) => item.id === input.batchId);
  const content = batch?.contentTasks.find((item) => item.id === input.contentTaskId);
  const imageTask = content?.imageTasks.find((item) => item.id === input.imageTaskId);
  if (!batch || !content || !imageTask?.runId) throw new Error("Image task not found");
  if (imageTask.status !== "failed") throw new Error("Only failed image tasks can be retried.");
  const run = await getCanvasRun(imageTask.runId, account);
  if (!run) throw new Error("Canvas child run not found");
  const latest = latestNodeAttempts(run.nodeRuns);
  const orderedAttempts = [
    ...(run.run.steps || []).map((step) => latest.get(step.nodeId)).filter((nodeRun): nodeRun is NonNullable<typeof nodeRun> => Boolean(nodeRun)),
    ...latest.values(),
  ];
  const failedNode = orderedAttempts.find((nodeRun) => ["failed", "blocked", "needs_config"].includes(nodeRun.status));
  if (!failedNode) throw new Error("No failed Canvas node is available to retry.");
  await retryCanvasNode(run.run.id, failedNode.nodeId, account);
  const now = new Date().toISOString();
  const next: CanvasSchedule = {
    ...current,
    revision: current.revision + 1,
    status: "running",
    completedAt: undefined,
    batches: current.batches.map((item) => item.id !== batch.id ? item : {
      ...item,
      status: "running",
      contentTasks: item.contentTasks.map((task) => task.id !== content.id ? task : {
        ...task,
        status: "running",
        imageTasks: task.imageTasks.map((candidate) => candidate.id !== imageTask.id ? candidate : {
          ...candidate,
          status: "queued",
          error: undefined,
          updatedAt: now,
        }),
        updatedAt: now,
      }),
      updatedAt: now,
    }),
    updatedAt: now,
  };
  await saveUpdatedSchedule(next, current.revision);
  kickCanvasSchedulerWorker();
  return next;
}

export async function acceptCanvasScheduleCandidates(
  scheduleId: string,
  account: WorkspaceAccessActor,
  input: { batchId: string; contentTaskId: string },
) {
  const current = await requireSchedule(scheduleId, account);
  const batch = current.batches.find((item) => item.id === input.batchId);
  const content = batch?.contentTasks.find((item) => item.id === input.contentTaskId);
  if (!batch || !content?.generatedPostId) throw new Error("Generated review draft not found");
  const post = await getGeneratedPost(content.generatedPostId, account);
  if (!post) throw new Error("Generated review draft not found");
  const saved = await updateGeneratedPost(post.id, { imageUrls: content.candidateImageUrls }, account);
  const now = new Date().toISOString();
  const next: CanvasSchedule = {
    ...current,
    revision: current.revision + 1,
    batches: current.batches.map((item) => item.id !== batch.id ? item : {
      ...item,
      contentTasks: item.contentTasks.map((task) => task.id !== content.id ? task : {
        ...task,
        assemblyFingerprint: imageFingerprint(task.candidateImageUrls),
        generatedPostUpdatedAt: saved.updatedAt,
        pendingCandidateSync: false,
        updatedAt: now,
      }),
      updatedAt: now,
    }),
    updatedAt: now,
  };
  await saveUpdatedSchedule(next, current.revision);
  return next;
}

export function validateCanvasSchedulerBindings(graph: CanvasGraph, requireCopyInput = false): CanvasScheduleBindings {
  const byRole = new Map<CanvasSchedulerRole, CanvasNode[]>();
  for (const node of graph.nodes) {
    if (!node.schedulerRole) continue;
    byRole.set(node.schedulerRole, [...(byRole.get(node.schedulerRole) || []), node]);
  }
  const missingRoles: CanvasSchedulerRole[] = CANVAS_REQUIRED_SCHEDULER_ROLES.filter((role) => !byRole.get(role)?.length);
  if (requireCopyInput && !byRole.get("copy-input")?.length) missingRoles.push("copy-input");
  const duplicateRoles = CANVAS_SCHEDULER_ROLES.filter((role) => (byRole.get(role)?.length || 0) > 1);
  if (missingRoles.length || duplicateRoles.length) {
    const problems = [
      missingRoles.length ? `缺少${formatSchedulerRoleList(missingRoles)}` : "",
      duplicateRoles.length ? `重复绑定${formatSchedulerRoleList(duplicateRoles)}` : "",
    ].filter(Boolean).join("；");
    throw new Error(`画布调度绑定不完整：${problems}。请在批量调度的“画布绑定”中完成选择。`);
  }
  buildCanvasRunPlan(graph);
  const bindings = {} as CanvasScheduleBindings;
  for (const role of CANVAS_REQUIRED_SCHEDULER_ROLES) {
    const node = byRole.get(role)![0];
    if (getCanvasNodeExecutionMode(node) !== "enabled") throw new Error(`“${CANVAS_SCHEDULER_ROLE_LABELS[role]}”节点必须处于启用状态。`);
    assertRoleNodeType(role, node);
    bindings[role] = node.id;
  }
  const copyNode = byRole.get("copy-input")?.[0];
  if (copyNode) {
    if (getCanvasNodeExecutionMode(copyNode) !== "enabled") throw new Error(`“${CANVAS_SCHEDULER_ROLE_LABELS["copy-input"]}”节点必须处于启用状态。`);
    assertRoleNodeType("copy-input", copyNode);
    bindings["copy-input"] = copyNode.id;
  }
  for (const sourceRole of ["scene-input", "vehicle-input", "prompt-switch"] as const) {
    if (!hasGraphPath(graph, bindings[sourceRole], bindings["image-target"])) {
      throw new Error(`调度角色 ${sourceRole} 必须连接到图片目标节点。`);
    }
  }
  if (!hasGraphPath(graph, bindings["image-target"], bindings["content-target"])) {
    throw new Error("图片目标节点必须连接到最终内容节点。");
  }
  if (bindings["copy-input"] && !hasGraphPath(graph, bindings["copy-input"], bindings["content-target"])) {
    throw new Error("文案库输入节点必须连接到最终内容节点。");
  }
  return bindings;
}

export function sampleCanvasAssets<T>(items: T[], count: number, random: () => number = Math.random) {
  if (!Number.isInteger(count) || count < 0) throw new Error("Sample count must be a non-negative integer.");
  if (count > items.length) throw new Error(`素材池只有 ${items.length} 张，无法抽取 ${count} 张不重复素材。`);
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(clampRandom(random()) * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, count);
}

export function assignCanvasScheduleCopies(
  items: CanvasScheduleCopySnapshot[],
  count: number,
  batchName: string,
  random: () => number = Math.random,
) {
  if (!Number.isInteger(count) || count < 0) throw new Error("Copy sample count must be a non-negative integer.");
  if (count > items.length) {
    throw new Error(`${batchName}: 文案池当前可用 ${items.length} 篇，本批次需要 ${count} 篇，无法保证批次内去重。`);
  }
  return sampleCanvasAssets(items, count, random);
}

export function createSchedulerImageGraph(
  source: CanvasGraph,
  bindings: CanvasScheduleBindings,
  strategy: CanvasPromptStrategy,
  scene: CanvasScheduleAssetSnapshot,
  vehicle: CanvasScheduleAssetSnapshot,
) {
  const graph = structuredClone(source);
  const normalizedStrategy = normalizeStrategy(strategy);
  graph.nodes = graph.nodes.map((node) => {
    if (node.id === bindings["scene-input"]) return bindImageInput(node, scene);
    if (node.id === bindings["vehicle-input"]) return bindImageInput(node, vehicle);
    if (node.id === bindings["prompt-switch"]) return node.version === 1
      ? { ...node, config: { ...node.config, strategy: legacyStrategy(normalizedStrategy) } }
      : { ...node, config: { ...node.config, selectedInput: normalizedStrategy.slice(-1) } };
    if (node.id === bindings["image-target"]) return { ...node, config: { ...node.config, count: 1 } };
    return node;
  });
  return graph;
}

export function createSchedulerFinalizationGraph(
  source: CanvasGraph,
  bindings: CanvasScheduleBindings,
  imageUrls: string[],
  copy?: CanvasScheduleCopySnapshot,
) {
  const graph = structuredClone(source);
  if (copy && !bindings["copy-input"]) throw new Error("Copy snapshot requires a copy-input scheduler binding.");
  graph.nodes = graph.nodes.map((node) => {
    if (node.id === bindings["image-target"]) return {
      ...node,
      type: "input.images" as const,
      version: 1 as const,
      config: { urls: imageUrls },
      executionMode: "enabled" as const,
      schedulerRole: undefined,
    };
    if (copy && node.id === bindings["copy-input"]) return bindCopyInput(node, copy);
    return node;
  });
  graph.edges = graph.edges.filter((edge) => edge.target !== bindings["image-target"]);
  return graph;
}

export function kickCanvasSchedulerWorker() {
  if (schedulerState.active) return;
  schedulerState.active = true;
  schedulerState.sequence += 1;
  setTimeout(() => void drainCanvasSchedules().finally(() => { schedulerState.active = false; }), 0);
}

async function drainCanvasSchedules() {
  const active = await reconcileCanvasSchedules();
  if (active > 0) setTimeout(kickCanvasSchedulerWorker, 2_000);
}

async function reconcileCanvasSchedules(onlyIds?: string[]) {
  const wanted = onlyIds ? new Set(onlyIds) : undefined;
  const schedules = (await listCanvasSchedulesFromDb()).map(normalizeStoredSchedule).filter((schedule) =>
    (!wanted || wanted.has(schedule.id)) && ["queued", "running", "paused"].includes(schedule.status),
  );
  for (const schedule of schedules) await reconcileSchedule(schedule);
  return schedules.length;
}

async function reconcileSchedule(current: CanvasSchedule) {
  if (!current.bindings || !current.workflowSnapshot) return;
  const bindings = current.bindings;
  const next = structuredClone(current);
  const now = new Date().toISOString();
  let changed = false;
  const finalizationRequests: CanvasScheduleContentTask[] = [];
  for (const batch of next.batches) {
    for (const content of batch.contentTasks) {
      for (const imageTask of content.imageTasks) {
        if (!imageTask.runId) continue;
        const run = await getCanvasRunFromDb(imageTask.runId);
        if (!run) continue;
        const status = scheduleTaskStatusFromRun(run.status);
        const error = terminalRunStatuses.has(run.status) ? run.error : undefined;
        const nodeRuns = terminalRunStatuses.has(run.status) ? await listCanvasNodeRunsFromDb(run.id) : [];
        const imageUrls = extractImageUrls(nodeRuns, bindings["image-target"]);
        if (imageTask.status !== status || stableSerialize(imageTask.imageUrls) !== stableSerialize(imageUrls) || imageTask.error !== error) {
          imageTask.status = status;
          imageTask.imageUrls = imageUrls;
          imageTask.error = error;
          imageTask.updatedAt = now;
          changed = true;
        }
      }
      const successfulUrls = uniqueStrings(content.imageTasks.flatMap((task) => task.imageUrls));
      if (stableSerialize(content.candidateImageUrls) !== stableSerialize(successfulUrls)) {
        content.candidateImageUrls = successfulUrls;
        changed = true;
      }
      const imagesTerminal = content.imageTasks.every((task) => terminalRunStatuses.has(task.status));
      if (!imagesTerminal) {
        const status = content.imageTasks.some((task) => task.status === "running") ? "running" : "queued";
        if (content.status !== status) { content.status = status; changed = true; }
        continue;
      }
      if (!successfulUrls.length) {
        if (content.status !== "failed") { content.status = "failed"; content.error = "全部图片子任务失败。"; changed = true; }
        continue;
      }
      if (!content.finalRunId) {
        content.finalRunId = finalRunId(content.id);
        content.status = "queued";
        content.updatedAt = now;
        changed = true;
      }
      const finalRun = await getCanvasRunFromDb(content.finalRunId);
      if (!finalRun) {
        if (current.status !== "paused") finalizationRequests.push(content);
        continue;
      }
      if (!terminalRunStatuses.has(finalRun.status)) {
        const status = finalRun.status === "running" ? "running" : "queued";
        if (content.status !== status) { content.status = status; changed = true; }
        continue;
      }
      const finalNodeRuns = await listCanvasNodeRunsFromDb(finalRun.id);
      const postArtifact = extractSocialPost(finalNodeRuns, bindings["content-target"]);
      if (!postArtifact) {
        if (content.status !== "failed" || content.error !== finalRun.error) {
          content.status = "failed";
          content.error = finalRun.error || "内容组装未生成评审草稿。";
          changed = true;
        }
        continue;
      }
      if (content.generatedPostId !== postArtifact.postId) {
        content.generatedPostId = postArtifact.postId;
        content.generatedPostUpdatedAt = postArtifact.post.updatedAt;
        content.assemblyFingerprint = imageFingerprint(successfulUrls);
        content.pendingCandidateSync = false;
        changed = true;
      } else if (content.assemblyFingerprint !== imageFingerprint(successfulUrls)) {
        const synced = await syncGeneratedPostCandidates(next, content);
        if (synced) changed = true;
      }
      const contentStatus = content.imageTasks.some((task) => task.status === "failed") ? "partial" : "completed";
      if (content.status !== contentStatus) { content.status = contentStatus; content.error = undefined; changed = true; }
      content.updatedAt = now;
    }
    const batchStatus = deriveAggregateStatus(batch.contentTasks.map((task) => task.status), current.status === "paused");
    if (batch.status !== batchStatus) { batch.status = batchStatus; batch.updatedAt = now; changed = true; }
  }
  const status = deriveAggregateStatus(next.batches.map((batch) => batch.status), current.status === "paused");
  if (next.status !== status) { next.status = status; changed = true; }
  if (["completed", "partial", "failed", "cancelled"].includes(status) && !next.completedAt) {
    next.completedAt = now;
    changed = true;
  }
  if (changed) {
    next.revision = current.revision + 1;
    next.updatedAt = now;
    if (!(await updateCanvasScheduleInDb(next, current.revision))) return;
  }
  const persisted = changed ? next : current;
  for (const content of finalizationRequests) {
    await createCanvasRunFromGraph({
      id: content.finalRunId || finalRunId(content.id),
      workflow: {
        id: persisted.workflowId,
        revision: persisted.workflowRevision,
        ownerUserId: persisted.ownerUserId,
        ownerDisplayName: persisted.ownerDisplayName,
      },
      graph: createSchedulerFinalizationGraph(persisted.workflowSnapshot!, persisted.bindings!, content.candidateImageUrls, content.copy),
      targetNodeIds: [persisted.bindings!["content-target"]],
      batchContext: {
        scheduleId: persisted.id,
        batchId: persisted.batches.find((batch) => batch.contentTasks.some((task) => task.id === content.id))?.id || "",
        contentTaskId: content.id,
        phase: "finalize",
      },
    });
  }
}

async function syncGeneratedPostCandidates(schedule: CanvasSchedule, content: CanvasScheduleContentTask) {
  if (!content.generatedPostId) return false;
  const actor = ownerActor(schedule);
  const post = await getGeneratedPost(content.generatedPostId, actor);
  if (!post) return false;
  if (post.status === "draft" && post.updatedAt === content.generatedPostUpdatedAt) {
    const saved = await updateGeneratedPost(post.id, { imageUrls: content.candidateImageUrls }, actor);
    content.generatedPostUpdatedAt = saved.updatedAt;
    content.assemblyFingerprint = imageFingerprint(content.candidateImageUrls);
    content.pendingCandidateSync = false;
    return true;
  } else {
    if (content.pendingCandidateSync) return false;
    content.pendingCandidateSync = true;
    return true;
  }
}

async function requireSchedule(scheduleId: string, account: WorkspaceAccessActor) {
  const schedule = await getCanvasScheduleFromDb(scheduleId);
  assertCanAccessWorkspaceRecord(account, schedule, "Canvas schedule not found");
  return normalizeStoredSchedule(schedule!);
}

async function requireScheduleWorkflow(schedule: CanvasSchedule, account: WorkspaceAccessActor, allowLatestRevision = false) {
  const workflow = await getCanvasWorkflow(schedule.workflowId, account);
  if (!workflow) throw new Error("Canvas workflow not found");
  if (!allowLatestRevision && workflow.revision !== schedule.workflowRevision) {
    throw new Error(`画布已从 r${schedule.workflowRevision} 更新到 r${workflow.revision}，请重新预演。`);
  }
  return workflow;
}

function formatSchedulerRoleList(roles: readonly CanvasSchedulerRole[]) {
  return roles.map((role) => `“${CANVAS_SCHEDULER_ROLE_LABELS[role]}”`).join("、");
}

async function saveUpdatedSchedule(schedule: CanvasSchedule, expectedRevision: number) {
  if (!(await updateCanvasScheduleInDb(schedule, expectedRevision))) throw new CanvasScheduleRevisionConflictError();
}

function assertRevision(schedule: CanvasSchedule, revision: number) {
  if (!Number.isInteger(revision) || revision !== schedule.revision) throw new CanvasScheduleRevisionConflictError();
}

async function resolveScheduleAssetPool(account: WorkspaceAccessActor, role: LibraryAssetRole, filter: CanvasScheduleAssetFilter) {
  const all: LibraryAsset[] = [];
  let cursor: string | undefined;
  do {
    const page = await listLibraryAssets(account, {
      role,
      limit: 100,
      cursor,
      ...(filter.mode === "random" ? {
        search: filter.search,
        collectionId: filter.collectionId,
        tags: filter.tags,
      } : {}),
    });
    all.push(...page.assets);
    cursor = page.nextCursor;
  } while (cursor);
  if (filter.mode === "random") return all.map(assetSnapshot);
  const byId = new Map(all.map((asset) => [asset.id, asset]));
  const missing = filter.assetIds.filter((id) => !byId.has(id));
  if (missing.length) throw new Error(`${role === "reference" ? "场景" : "车型"}素材已删除或无权访问：${missing[0]}`);
  return filter.assetIds.map((id) => assetSnapshot(byId.get(id)!));
}

async function resolveScheduleCopyPool(account: WorkspaceAccessActor, filter: CanvasScheduleCopyFilter) {
  const response = await listCopyLibraryEntries(account, filter.mode === "tags" ? { search: filter.search, tags: filter.tags } : {});
  const entries = response.entries;
  if (filter.mode === "tags") return entries.map(copySnapshot).sort(compareCopySnapshots);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const missing = filter.entryIds.find((id) => !byId.has(id));
  if (missing) throw new Error(`文案已删除或无权访问：${missing}`);
  return filter.entryIds.map((id) => copySnapshot(byId.get(id)!)).sort(compareCopySnapshots);
}

async function assertFrozenAssetsStillAvailable(schedule: CanvasSchedule, account: WorkspaceAccessActor) {
  const required = new Map<LibraryAssetRole, Set<string>>([
    ["reference", new Set(schedule.batches.flatMap((batch) => batch.contentTasks.map((task) => task.scene.id)))],
    ["vehicle", new Set(schedule.batches.flatMap((batch) => batch.contentTasks.flatMap((task) => task.vehicles.map((asset) => asset.id))))],
  ]);
  for (const role of ["reference", "vehicle"] as const) {
    const filter: CanvasScheduleAssetFilter = { mode: "random", assetIds: [], search: "", tags: [] };
    const visible = new Set((await resolveScheduleAssetPool(account, role, filter)).map((asset) => asset.id));
    const missing = Array.from(required.get(role) || []).find((id) => !visible.has(id));
    if (missing) throw new Error(`预演素材已删除或无权访问：${missing}`);
  }
}

function makeContentTask(
  scene: CanvasScheduleAssetSnapshot,
  vehiclePool: CanvasScheduleAssetSnapshot[],
  batch: Pick<CanvasScheduleBatch, "vehicleCountMin" | "vehicleCountMax">,
  now: string,
  existingId?: string,
  copy?: CanvasScheduleCopySnapshot,
) {
  const count = randomInteger(batch.vehicleCountMin, batch.vehicleCountMax);
  const vehicles = sampleCanvasAssets(vehiclePool, count);
  const id = existingId || `canvas-content-task-${randomUUID()}`;
  const imageTasks = vehicles.map((vehicle): CanvasScheduleImageTask => ({
    id: `canvas-image-task-${randomUUID()}`,
    vehicle,
    status: "pending",
    imageUrls: [],
    createdAt: now,
    updatedAt: now,
  }));
  return {
    id,
    scene,
    vehicles,
    imageTasks,
    copy: copy ? structuredClone(copy) : undefined,
    status: "pending" as const,
    candidateImageUrls: [],
    createdAt: now,
    updatedAt: now,
  };
}

function newScheduleBatch(now: string, index: number): CanvasScheduleBatch {
  return {
    id: `canvas-batch-${randomUUID()}`,
    name: `批次 ${index}`,
    strategy: "input-1",
    sceneFilter: emptyAssetFilter(),
    sceneCount: 1,
    vehicleFilter: emptyAssetFilter(),
    vehicleCountMin: 1,
    vehicleCountMax: 3,
    status: "draft",
    contentTasks: [],
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeBatches(input: ScheduleBatchDraft[], previous: CanvasScheduleBatch[], now: string) {
  if (!Array.isArray(input) || !input.length) throw new Error("At least one batch is required.");
  if (input.length > maxScheduleBatches) throw new Error(`V1 supports at most ${maxScheduleBatches} batches per schedule.`);
  const known = new Map(previous.map((batch) => [batch.id, batch]));
  const ids = new Set<string>();
  return input.map((batch, index): CanvasScheduleBatch => {
    const id = typeof batch.id === "string" && batch.id.trim() ? batch.id.trim() : `canvas-batch-${randomUUID()}`;
    if (ids.has(id)) throw new Error("Batch ids must be unique.");
    ids.add(id);
    const vehicleCountMin = normalizeInteger(batch.vehicleCountMin, 1, maxVehiclesPerContent, "最少车型图片数");
    const vehicleCountMax = normalizeInteger(batch.vehicleCountMax, 1, maxVehiclesPerContent, "最多车型图片数");
    if (vehicleCountMin > vehicleCountMax) throw new Error("最少车型图片数不能大于最多数量。");
    return {
      id,
      name: normalizeName(batch.name, `批次 ${index + 1}`),
      strategy: normalizeStrategy(batch.strategy),
      sceneFilter: normalizeAssetFilter(batch.sceneFilter),
      sceneCount: normalizeInteger(batch.sceneCount, 1, maxScenesPerBatch, "场景数量"),
      vehicleFilter: normalizeAssetFilter(batch.vehicleFilter),
      vehicleCountMin,
      vehicleCountMax,
      copyFilter: batch.copyFilter === undefined ? undefined : normalizeCopyFilter(batch.copyFilter),
      status: "draft",
      contentTasks: [],
      createdAt: known.get(id)?.createdAt || now,
      updatedAt: now,
    };
  });
}

function stripBatchRuntime(batch: CanvasScheduleBatch): CanvasScheduleBatch {
  return {
    ...batch,
    sceneFilter: normalizeAssetFilter(batch.sceneFilter),
    vehicleFilter: normalizeAssetFilter(batch.vehicleFilter),
    copyFilter: batch.copyFilter === undefined ? undefined : normalizeCopyFilter(batch.copyFilter),
    status: "draft",
    contentTasks: [],
    error: undefined,
  };
}

function normalizeAssetFilter(value: CanvasScheduleAssetFilter | undefined): CanvasScheduleAssetFilter {
  return {
    mode: value?.mode === "random" ? "random" : "manual",
    assetIds: uniqueStrings(value?.assetIds || []).slice(0, maxImageTasks),
    search: String(value?.search || "").trim().slice(0, 120),
    collectionId: String(value?.collectionId || "").trim() || undefined,
    tags: uniqueStrings(value?.tags || []).slice(0, 20),
  };
}

function emptyAssetFilter(): CanvasScheduleAssetFilter {
  return { mode: "manual", assetIds: [], search: "", tags: [] };
}

function normalizeCopyFilter(value: CanvasScheduleCopyFilter): CanvasScheduleCopyFilter {
  return {
    mode: value?.mode === "tags" ? "tags" : "manual",
    entryIds: uniqueStrings(value?.entryIds || []).slice(0, maxImageTasks),
    search: String(value?.search || "").trim().slice(0, 120),
    tags: uniqueStrings(value?.tags || []).slice(0, 20),
  };
}

function assetSnapshot(asset: LibraryAsset): CanvasScheduleAssetSnapshot {
  return {
    id: asset.id,
    url: asset.publicUrl,
    name: asset.name,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
  };
}

function copySnapshot(entry: CopyLibraryEntry): CanvasScheduleCopySnapshot {
  return { id: entry.id, title: entry.title, body: entry.body, tags: [...entry.tags], updatedAt: entry.updatedAt };
}

function compareCopySnapshots(left: CanvasScheduleCopySnapshot, right: CanvasScheduleCopySnapshot) {
  return left.title.localeCompare(right.title, "zh-CN") || left.id.localeCompare(right.id);
}

function bindImageInput(node: CanvasNode, asset: CanvasScheduleAssetSnapshot): CanvasNode {
  if (node.type === "input.library-images") {
    return { ...node, config: { ...node.config, assetIds: [asset.id], assetNames: [asset.name || asset.id], urls: [asset.url], snapshotAt: new Date().toISOString() } };
  }
  return { ...node, config: { ...node.config, urls: [asset.url] } };
}

function bindCopyInput(node: CanvasNode, copy: CanvasScheduleCopySnapshot): CanvasNode {
  if (node.type !== "input.copy-library") throw new Error("copy-input must bind an input.copy-library node.");
  return {
    ...node,
    config: {
      ...node.config,
      entryId: copy.id,
      entryTitle: copy.title,
      snapshotTitle: copy.title,
      snapshotBody: copy.body,
      snapshotTags: copy.tags,
      snapshotAt: copy.updatedAt,
    },
  };
}

function assertRoleNodeType(role: CanvasSchedulerRole, node: CanvasNode) {
  if ((role === "scene-input" || role === "vehicle-input") && !["input.images", "input.library-images"].includes(node.type)) {
    throw new Error(`调度角色 ${role} 只能绑定图片或素材库图片节点。`);
  }
  if (role === "copy-input" && node.type !== "input.copy-library") {
    throw new Error("调度角色 copy-input 只能绑定文案库节点。");
  }
  const expected = role === "prompt-switch" ? "utility.prompt-switch"
    : role === "image-target" ? "model.gpt-image"
      : role === "content-target" ? "compose.social-post" : undefined;
  if (expected && node.type !== expected) throw new Error(`调度角色 ${role} 必须绑定 ${expected} 节点。`);
  if (role === "image-target" && node.version < 2) throw new Error("图片目标必须使用 GPT-Image-2 V2 节点。");
}

function hasGraphPath(graph: CanvasGraph, sourceId: string, targetId: string) {
  const pending = [sourceId];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.shift();
    if (!current || visited.has(current)) continue;
    if (current === targetId) return true;
    visited.add(current);
    pending.push(...graph.edges.filter((edge) => edge.source === current).map((edge) => edge.target));
  }
  return false;
}

function roundRobinImageTasks(schedule: CanvasSchedule) {
  const lanes = schedule.batches.map((batch) => batch.contentTasks.flatMap((content) => content.imageTasks.map((imageTask) => ({ batch, content, imageTask }))));
  const result: Array<{ batch: CanvasScheduleBatch; content: CanvasScheduleContentTask; imageTask: CanvasScheduleImageTask }> = [];
  for (let index = 0; lanes.some((lane) => index < lane.length); index += 1) {
    for (const lane of lanes) if (lane[index]) result.push(lane[index]);
  }
  return result;
}

function scheduleRunIds(schedule: CanvasSchedule) {
  return uniqueStrings(schedule.batches.flatMap((batch) => batch.contentTasks.flatMap((content) => [
    content.finalRunId || "",
    ...content.imageTasks.map((task) => task.runId || ""),
  ])));
}

function latestNodeAttempts(nodeRuns: Awaited<ReturnType<typeof listCanvasNodeRunsFromDb>>) {
  const latest = new Map<string, (typeof nodeRuns)[number]>();
  for (const nodeRun of nodeRuns) {
    const previous = latest.get(nodeRun.nodeId);
    if (!previous || nodeRun.attempt > previous.attempt) latest.set(nodeRun.nodeId, nodeRun);
  }
  return latest;
}

function extractImageUrls(nodeRuns: Awaited<ReturnType<typeof listCanvasNodeRunsFromDb>>, nodeId: string) {
  const output = latestNodeAttempts(nodeRuns).get(nodeId)?.outputs.images;
  return output?.kind === "images" ? uniqueStrings(output.items.map((item) => item.url)) : [];
}

function extractSocialPost(nodeRuns: Awaited<ReturnType<typeof listCanvasNodeRunsFromDb>>, nodeId: string) {
  const outputs = Object.values(latestNodeAttempts(nodeRuns).get(nodeId)?.outputs || {});
  return outputs.find((artifact): artifact is Extract<CanvasArtifact, { kind: "socialPost" }> => artifact.kind === "socialPost");
}

function scheduleTaskStatusFromRun(status: CanvasRun["status"]): CanvasScheduleImageTask["status"] {
  if (status === "completed") return "completed";
  if (status === "failed" || status === "partial") return "failed";
  if (status === "cancelled") return "cancelled";
  return status === "running" ? "running" : "queued";
}

function deriveAggregateStatus(statuses: Array<CanvasScheduleStatus | CanvasScheduleContentTask["status"]>, paused: boolean): CanvasScheduleStatus {
  if (paused) return "paused";
  if (statuses.some((status) => status === "running")) return "running";
  if (statuses.some((status) => status === "queued" || status === "pending")) return "queued";
  const completed = statuses.filter((status) => status === "completed").length;
  const partial = statuses.filter((status) => status === "partial").length;
  const failed = statuses.filter((status) => status === "failed").length;
  const cancelled = statuses.filter((status) => status === "cancelled").length;
  if (completed === statuses.length) return "completed";
  if (cancelled === statuses.length) return "cancelled";
  if (failed === statuses.length) return "failed";
  if (completed || partial || failed || cancelled) return "partial";
  return "queued";
}

function normalizeStrategy(value: CanvasPromptStrategy | string): CanvasPromptStrategy {
  if (["input-1", "input-2", "input-3"].includes(value)) return value as CanvasPromptStrategy;
  if (value === "scene") return "input-1";
  if (value === "scene-modification") return "input-2";
  if (value === "scene-person") return "input-3";
  throw new Error("Prompt strategy is invalid.");
}

function legacyStrategy(value: CanvasPromptStrategy) {
  if (value === "input-2") return "scene-modification";
  if (value === "input-3") return "scene-person";
  return "scene";
}

function normalizeStoredSchedule(schedule: CanvasSchedule): CanvasSchedule {
  return {
    ...schedule,
    batches: schedule.batches.map((batch) => ({
      ...batch,
      strategy: normalizeStrategy(String(batch.strategy)),
      copyFilter: batch.copyFilter === undefined ? undefined : normalizeCopyFilter(batch.copyFilter),
    })),
  };
}

function normalizeInteger(value: number, min: number, max: number, label: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${label}必须是 ${min}-${max} 的整数。`);
  return number;
}

function normalizeName(value: string | undefined, fallback: string) {
  const name = String(value || fallback).trim();
  if (!name) throw new Error("Name is required.");
  if (name.length > 80) throw new Error("Name must be 80 characters or fewer.");
  return name;
}

function ownerActor(schedule: CanvasSchedule): WorkspaceAccessActor {
  return { id: schedule.ownerUserId, displayName: schedule.ownerDisplayName, role: "operator" };
}

function randomInteger(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function clampRandom(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, 0.9999999999999999);
}

function imageRunId(imageTaskId: string) { return `canvas-scheduler-run-${imageTaskId}`; }
function finalRunId(contentTaskId: string) { return `canvas-scheduler-final-${contentTaskId}`; }
function imageFingerprint(urls: string[]) { return hash(stableSerialize(uniqueStrings(urls))); }
function previewFingerprint(batches: CanvasScheduleBatch[]) { return hash(stableSerialize(batches.map((batch) => batch.contentTasks))); }
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function stableSerialize(value: unknown) { return JSON.stringify(canonicalize(value)); }
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, canonicalize(item)]));
}
function uniqueStrings(values: string[]) { return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean))); }
