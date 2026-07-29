import { createHash, randomUUID } from "node:crypto";
import {
  claimNextCanvasRunQueueItem,
  enqueueCanvasRunQueueItem,
  finishCanvasRunQueueItem,
  getCanvasNodeRunFromDb,
  getCanvasRunFromDb,
  heartbeatCanvasRunQueueItem,
  listCanvasNodeRunsFromDb,
  listCanvasRunsFromDb,
  listCanvasSuccessfulNodeRunsForWorkflowFromDb,
  requeueExpiredCanvasRunQueueItemsWithProviderTasks,
  requeueCanvasRunQueueItem,
  saveCanvasNodeRunToDb,
  saveCanvasRunToDb,
} from "../database";
import {
  canAccessWorkspaceOwner,
  filterWorkspaceOwnedRecords,
  type WorkspaceAccessActor,
} from "../workspace-ownership";
import { concurrencyConfig } from "../concurrency";
import { CanvasNeedsConfigError, executeCanvasNode, resolveCanvasLiteralOutputs } from "./executors";
import { DreaminaNeedsConfigError, getDreaminaCredit } from "./dreamina";
import { buildCanvasRunPlan, collectDescendants } from "./graph";
import { getCanvasNodeDefinition, getCanvasNodeExecutionMode, normalizeUrlList } from "./registry";
import type {
  CanvasArtifact,
  CanvasEdge,
  CanvasGraph,
  CanvasLatestSuccessfulNodeRun,
  CanvasNode,
  CanvasNodeRun,
  CanvasNodeRunStatus,
  CanvasRun,
  CanvasRunMode,
  CanvasRunPlan,
  CanvasRunPlanStep,
  CanvasRunWithNodes,
} from "./types";
import { getCanvasWorkflow } from "./workflows";

const queueLockMs = 10 * 60_000;
const queueHeartbeatMs = 30_000;

type CanvasQueueGlobalState = typeof globalThis & {
  __fluxpostCanvasQueue?: { activeWorkers?: number; sequence?: number };
};

const storedQueueState = ((globalThis as CanvasQueueGlobalState).__fluxpostCanvasQueue ||= {});
storedQueueState.activeWorkers ??= 0;
storedQueueState.sequence ??= 0;
const queueState = storedQueueState as Required<typeof storedQueueState>;

export async function planCanvasRun(workflowId: string, account: WorkspaceAccessActor, targetNodeIds?: string[]) {
  return planCanvasRunWithMode(workflowId, account, targetNodeIds, "with-upstream");
}

export async function planCanvasRunWithMode(
  workflowId: string,
  account: WorkspaceAccessActor,
  targetNodeIds?: string[],
  runMode: CanvasRunMode = "with-upstream",
) {
  const workflow = await getCanvasWorkflow(workflowId, account);
  if (!workflow) throw new Error("Canvas workflow not found");
  runMode = runMode === "isolated" ? "isolated" : "with-upstream";
  const plan = await resolveCanvasRunPlan(workflow.graph, workflow.id, targetNodeIds, runMode);
  const details = [] as NonNullable<CanvasRunPlan["confirmationDetails"]>;
  let preflightBlocked = false;
  for (const nodeId of plan.confirmationNodeIds) {
    const node = findNode(workflow.graph.nodes, nodeId);
    const definition = getCanvasNodeDefinition(node.type);
    if (node.type !== "model.seedance") {
      details.push({ nodeId, label: definition?.label || node.type, status: "ready" });
      continue;
    }
    try {
      const credit = await getDreaminaCredit();
      const blocked = credit.totalCredit < 100;
      preflightBlocked ||= blocked;
      details.push({
        nodeId,
        label: definition?.label || node.type,
        model: String(node.config.modelVersion),
        resolution: String(node.config.resolution),
        durationSeconds: Number(node.config.duration),
        credit: credit.totalCredit,
        status: blocked ? "blocked" : "ready",
        message: blocked ? "Dreamina 余额低于 100 积分，已阻止提交。" : undefined,
      });
    } catch (error) {
      const needsConfig = error instanceof DreaminaNeedsConfigError;
      details.push({
        nodeId,
        label: definition?.label || node.type,
        model: String(node.config.modelVersion),
        resolution: String(node.config.resolution),
        durationSeconds: Number(node.config.duration),
        status: needsConfig ? "needs_config" : "blocked",
        message: error instanceof Error ? error.message : "Dreamina preflight failed.",
      });
      preflightBlocked ||= !needsConfig;
    }
  }
  return { workflow, plan: { ...plan, confirmationDetails: details, preflightBlocked: preflightBlocked || plan.preflightBlocked === true } };
}

async function resolveCanvasRunPlan(
  graph: CanvasGraph,
  workflowId: string,
  targetNodeIds: string[] | undefined,
  runMode: CanvasRunMode,
): Promise<CanvasRunPlan> {
  const base = buildCanvasRunPlan(graph, targetNodeIds);
  if (runMode === "with-upstream") return base;
  const targets = Array.from(new Set((targetNodeIds || []).filter(Boolean)));
  if (targets.length !== 1) throw new Error("Isolated canvas execution requires exactly one target node.");

  const targetId = targets[0];
  const candidatesByNode = new Map<string, Array<{ run: CanvasRun; nodeRun: CanvasNodeRun }>>();
  for (const candidate of await listCanvasSuccessfulNodeRunsForWorkflowFromDb(workflowId)) {
    const candidates = candidatesByNode.get(candidate.nodeRun.nodeId) || [];
    candidates.push(candidate);
    candidatesByNode.set(candidate.nodeRun.nodeId, candidates);
  }

  const outputs = new Map<string, Record<string, CanvasArtifact>>();
  const steps: CanvasRunPlanStep[] = [];
  const blockers: CanvasRunPlan["blockers"] = [];
  for (const nodeId of base.order) {
    const node = findNode(graph.nodes, nodeId);
    const definition = getCanvasNodeDefinition(node.type, node.version);
    if (!definition) continue;
    const inputs = collectInputs(graph.edges, node.id, outputs);
    const mode = getCanvasNodeExecutionMode(node);

    if (mode === "disabled") {
      const message = nodeId === targetId ? `${definition.label} is disabled.` : undefined;
      steps.push({ nodeId, action: "disabled", message });
      if (message) blockers.push({ nodeId, message });
      continue;
    }
    if (mode === "bypass") {
      const output = resolveBypassOutputs(node, inputs);
      if (!output) {
        const message = `${definition.label} cannot bypass because input ${definition.bypass?.inputPort || "(unsupported)"} is unavailable.`;
        steps.push({ nodeId, action: "blocked", message });
        blockers.push({ nodeId, message });
      } else {
        outputs.set(nodeId, output);
        steps.push({ nodeId, action: "bypass" });
      }
      continue;
    }

    const missingInput = missingRequiredInput(node, inputs);
    const passivePreviewSink = definition.passiveSink && nodeId !== targetId && !canReachNode(graph, nodeId, targetId);
    if (passivePreviewSink) {
      steps.push({ nodeId, action: "execute" });
      continue;
    }
    const executesLocally = nodeId === targetId || node.type.startsWith("input.");
    if (executesLocally) {
      if (missingInput) {
        const message = `${definition.label}: Missing required input ${missingInput}.`;
        steps.push({ nodeId, action: "blocked", message });
        blockers.push({ nodeId, message });
      } else {
        steps.push({ nodeId, action: "execute" });
        const literalOutputs = resolveCanvasLiteralOutputs(node);
        if (literalOutputs) outputs.set(nodeId, literalOutputs);
      }
      continue;
    }

    const candidate = (candidatesByNode.get(nodeId) || []).find((item) =>
      isReusableCandidate(graph, node, inputs, item.run, item.nodeRun),
    );
    if (!candidate) {
      const message = `${definition.label} has no compatible successful result for isolated execution.`;
      steps.push({ nodeId, action: "blocked", message });
      blockers.push({ nodeId, message });
      continue;
    }
    outputs.set(nodeId, structuredClone(candidate.nodeRun.outputs));
    steps.push({
      nodeId,
      action: "reuse",
      sourceRunId: candidate.run.id,
      sourceNodeRunId: candidate.nodeRun.id,
    });
  }

  const executableIds = new Set(steps.filter((step) => step.action === "execute").map((step) => step.nodeId));
  const confirmationNodeIds = base.order.filter((nodeId) => executableIds.has(nodeId) && getCanvasNodeDefinition(findNode(graph.nodes, nodeId).type)?.capability);
  const capabilities = Array.from(new Set(confirmationNodeIds
    .map((nodeId) => getCanvasNodeDefinition(findNode(graph.nodes, nodeId).type)?.capability)
    .filter((capability): capability is NonNullable<typeof capability> => Boolean(capability))));
  return { ...base, steps, blockers, confirmationNodeIds, capabilities, preflightBlocked: blockers.length > 0 };
}

function isReusableCandidate(
  graph: CanvasGraph,
  node: CanvasNode,
  inputs: Record<string, CanvasArtifact[]>,
  sourceRun: CanvasRun,
  sourceNodeRun: CanvasNodeRun,
) {
  const sourceNode = sourceRun.graphSnapshot.nodes.find((item) => item.id === node.id);
  if (!sourceNode || sourceNode.type !== node.type || sourceNode.version !== node.version || !Object.keys(sourceNodeRun.outputs).length) return false;
  if (node.type === "utility.image-preview") {
    return stableSerialize(incomingEdgeIdentity(graph, node.id)) === stableSerialize(incomingEdgeIdentity(sourceRun.graphSnapshot, node.id));
  }
  const currentFingerprint = fingerprintCanvasNodeExecution(node, inputs);
  return currentFingerprint === (sourceNodeRun.inputFingerprint || fingerprintCanvasNodeExecution(sourceNode, sourceNodeRun.inputs));
}

function incomingEdgeIdentity(graph: CanvasGraph, nodeId: string) {
  return graph.edges.filter((edge) => edge.target === nodeId)
    .map(({ source, sourcePort, targetPort }) => ({ source, sourcePort, targetPort }));
}

function canReachNode(graph: CanvasGraph, sourceNodeId: string, targetNodeId: string) {
  const visited = new Set<string>();
  const pending = [sourceNodeId];
  while (pending.length) {
    const current = pending.shift();
    if (!current || visited.has(current)) continue;
    if (current === targetNodeId) return true;
    visited.add(current);
    pending.push(...graph.edges.filter((edge) => edge.source === current).map((edge) => edge.target));
  }
  return false;
}

export async function createCanvasRun(
  workflowId: string,
  account: WorkspaceAccessActor,
  input: { targetNodeIds?: string[]; runMode?: CanvasRunMode; confirmed?: boolean; confirmationNodeIds?: string[] },
) {
  const runMode = input.runMode === "isolated" ? "isolated" : "with-upstream";
  const { workflow, plan } = await planCanvasRunWithMode(workflowId, account, input.targetNodeIds, runMode);
  if (plan.preflightBlocked) throw new Error(plan.blockers[0]?.message || "Canvas run is blocked by provider preflight. Review the confirmation details.");
  if (plan.capabilities.length && input.confirmed !== true) {
    throw new CanvasConfirmationRequiredError(plan);
  }
  if (input.confirmed === true && !sameStringSet(input.confirmationNodeIds || [], plan.confirmationNodeIds)) {
    throw new Error("Run confirmation is stale. Review the current billable and external-write nodes again.");
  }
  const now = new Date().toISOString();
  const run: CanvasRun = {
    id: `canvas-run-${Date.now()}-${randomUUID().slice(0, 8)}`,
    workflowId: workflow.id,
    workflowRevision: workflow.revision,
    ownerUserId: workflow.ownerUserId,
    ownerDisplayName: workflow.ownerDisplayName,
    status: "queued",
    graphSnapshot: structuredClone(workflow.graph),
    runMode,
    steps: structuredClone(plan.steps),
    targetNodeIds: input.targetNodeIds?.length ? Array.from(new Set(input.targetNodeIds)) : undefined,
    confirmation: {
      confirmedAt: now,
      nodeIds: plan.confirmationNodeIds,
      capabilities: plan.capabilities,
    },
    createdAt: now,
    updatedAt: now,
  };
  await saveCanvasRunToDb(run);
  await enqueueCanvasRunQueueItem(run);
  ensureCanvasRunWorker();
  return run;
}

export async function createCanvasRunFromGraph(input: {
  id: string;
  workflow: { id: string; revision: number; ownerUserId: string; ownerDisplayName: string };
  graph: CanvasGraph;
  targetNodeIds: string[];
  batchContext: NonNullable<CanvasRun["batchContext"]>;
}) {
  const existing = await getCanvasRunFromDb(input.id);
  if (existing) return existing;
  const run = prepareCanvasRunFromGraph(input);
  await saveCanvasRunToDb(run);
  await enqueueCanvasRunQueueItem(run);
  ensureCanvasRunWorker();
  return run;
}

export function prepareCanvasRunFromGraph(input: {
  id: string;
  workflow: { id: string; revision: number; ownerUserId: string; ownerDisplayName: string };
  graph: CanvasGraph;
  targetNodeIds: string[];
  batchContext: NonNullable<CanvasRun["batchContext"]>;
  createdAt?: string;
}) {
  const plan = buildCanvasRunPlan(input.graph, input.targetNodeIds);
  if (plan.blockers.length) throw new Error(plan.blockers[0].message);
  const now = input.createdAt || new Date().toISOString();
  const run: CanvasRun = {
    id: input.id,
    workflowId: input.workflow.id,
    workflowRevision: input.workflow.revision,
    ownerUserId: input.workflow.ownerUserId,
    ownerDisplayName: input.workflow.ownerDisplayName,
    status: "queued",
    graphSnapshot: structuredClone(input.graph),
    runMode: "with-upstream",
    steps: structuredClone(plan.steps),
    targetNodeIds: Array.from(new Set(input.targetNodeIds)),
    batchContext: structuredClone(input.batchContext),
    confirmation: {
      confirmedAt: now,
      nodeIds: plan.confirmationNodeIds,
      capabilities: plan.capabilities,
    },
    createdAt: now,
    updatedAt: now,
  };
  return run;
}

export class CanvasConfirmationRequiredError extends Error {
  constructor(public readonly plan: CanvasRunPlan) {
    super("This run requires explicit confirmation.");
    this.name = "CanvasConfirmationRequiredError";
  }
}

export async function listCanvasRuns(account: WorkspaceAccessActor, workflowId?: string) {
  return filterWorkspaceOwnedRecords(await listCanvasRunsFromDb(50), account).filter((run) => !workflowId || run.workflowId === workflowId);
}

export async function listCanvasRunHistory(account: WorkspaceAccessActor, workflowId?: string) {
  if (workflowId && !(await getCanvasWorkflow(workflowId, account))) throw new Error("Canvas workflow not found");
  const runs = await listCanvasRuns(account, workflowId);
  const latestSuccessfulNodeRuns = new Map<string, CanvasLatestSuccessfulNodeRun>();
  const durableResults = workflowId
    ? await listCanvasSuccessfulNodeRunsForWorkflowFromDb(workflowId)
    : (await Promise.all(runs.map(async (run) => (await listCanvasNodeRunsFromDb(run.id))
      .filter((nodeRun) => isOutputStatus(nodeRun.status))
      .map((nodeRun) => ({ run, nodeRun }))))).flat();
  for (const { run, nodeRun } of durableResults) {
    if (latestSuccessfulNodeRuns.has(nodeRun.nodeId) || !Object.keys(nodeRun.outputs).length) continue;
    const snapshotNode = run.graphSnapshot.nodes.find((item) => item.id === nodeRun.nodeId);
    if (!snapshotNode) continue;
    latestSuccessfulNodeRuns.set(nodeRun.nodeId, {
      runId: run.id,
      workflowRevision: run.workflowRevision,
      runCreatedAt: run.createdAt,
      nodeVersion: snapshotNode.version,
      nodeConfig: structuredClone(snapshotNode.config),
      nodeRun,
    });
  }
  return { runs, latestSuccessfulNodeRuns: Array.from(latestSuccessfulNodeRuns.values()) };
}

export async function getCanvasRun(runId: string, account: WorkspaceAccessActor): Promise<CanvasRunWithNodes | undefined> {
  const run = await getCanvasRunFromDb(runId);
  if (!run || !canAccessWorkspaceOwner(account, run.ownerUserId)) return undefined;
  return { run, nodeRuns: await listCanvasNodeRunsFromDb(run.id) };
}

export async function cancelCanvasRun(runId: string, account: WorkspaceAccessActor) {
  const current = await getCanvasRun(runId, account);
  if (!current) throw new Error("Canvas run not found");
  if (["completed", "failed", "cancelled"].includes(current.run.status)) return current.run;
  const now = new Date().toISOString();
  const run = await saveCanvasRunToDb({
    ...current.run,
    status: current.run.status === "queued" ? "cancelled" : current.run.status,
    cancelRequestedAt: now,
    updatedAt: now,
    ...(current.run.status === "queued" ? { completedAt: now } : {}),
  });
  return run;
}

export async function retryCanvasNode(runId: string, nodeId: string, account: WorkspaceAccessActor) {
  const current = await getCanvasRun(runId, account);
  if (!current) throw new Error("Canvas run not found");
  const plan = buildCanvasRunPlan(current.run.graphSnapshot, current.run.targetNodeIds);
  if (!plan.includedNodeIds.includes(nodeId)) throw new Error("Canvas node is not part of this run.");
  const retryNodeIds = Array.from(collectDescendants(current.run.graphSnapshot, [nodeId])).filter((id) => plan.includedNodeIds.includes(id));
  const now = new Date().toISOString();
  const run = await saveCanvasRunToDb({
    ...current.run,
    status: "queued",
    retryNodeIds,
    cancelRequestedAt: undefined,
    completedAt: undefined,
    error: undefined,
    updatedAt: now,
  });
  if (!(await requeueCanvasRunQueueItem(run.id))) await enqueueCanvasRunQueueItem(run);
  ensureCanvasRunWorker();
  return run;
}

export function ensureCanvasRunWorker() {
  const workersToStart = Math.max(0, concurrencyConfig.canvasRun - queueState.activeWorkers);
  for (let index = 0; index < workersToStart; index += 1) {
    queueState.activeWorkers += 1;
    queueState.sequence += 1;
    const workerId = `canvas-worker-${process.pid}-${Date.now()}-${queueState.sequence}`;
    setTimeout(() => {
      void drainCanvasRuns(workerId).finally(() => {
        queueState.activeWorkers = Math.max(0, queueState.activeWorkers - 1);
      });
    }, 0);
  }
}

async function drainCanvasRuns(workerId: string) {
  await requeueExpiredCanvasRunQueueItemsWithProviderTasks();
  while (true) {
    const queueItem = await claimNextCanvasRunQueueItem(workerId, queueLockMs);
    if (!queueItem) return;
    let batchRun: CanvasRun | undefined;
    let batchRunTerminal = false;
    const heartbeat = setInterval(() => {
      void heartbeatCanvasRunQueueItem(queueItem.id, workerId, queueLockMs).catch((error) =>
        console.warn(`Canvas queue heartbeat failed for ${queueItem.runId}:`, error),
      );
    }, queueHeartbeatMs);
    try {
      const run = await getCanvasRunFromDb(queueItem.runId);
      if (!run) throw new Error("Canvas run not found");
      batchRun = run;
      if (run.cancelRequestedAt || run.status === "cancelled") {
        await finishCanvasRunQueueItem(queueItem.id, workerId, "cancelled");
        batchRunTerminal = true;
        continue;
      }
      const finalRun = await executeCanvasRun(run);
      batchRun = finalRun;
      if (finalRun.status === "running") {
        // A provider accepted the task but has not produced a terminal result yet.
        // Requeue the same run so the next attempt queries its persisted submit_id.
        await requeueCanvasRunQueueItem(finalRun.id, 30_000);
        setTimeout(ensureCanvasRunWorker, 30_000);
        continue;
      }
      const queueStatus = finalRun.status === "cancelled" ? "cancelled" : finalRun.status === "completed" ? "completed" : "failed";
      await finishCanvasRunQueueItem(queueItem.id, workerId, queueStatus, finalRun.error);
      batchRunTerminal = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Canvas run failed";
      const run = await getCanvasRunFromDb(queueItem.runId);
      if (run) {
        const now = new Date().toISOString();
        batchRun = await saveCanvasRunToDb({ ...run, status: "failed", error: message, updatedAt: now, completedAt: now });
      }
      await finishCanvasRunQueueItem(queueItem.id, workerId, "failed", message);
      batchRunTerminal = true;
    } finally {
      clearInterval(heartbeat);
      if (batchRunTerminal && batchRun?.batchContext) notifyCanvasScheduleRunTerminal(batchRun);
    }
  }
}

function notifyCanvasScheduleRunTerminal(run: CanvasRun) {
  void import("./scheduler")
    .then(({ kickCanvasSchedulerWorker }) => kickCanvasSchedulerWorker())
    .catch((error) => console.error(`Canvas schedule wakeup failed for ${run.id}:`, error));
}

async function executeCanvasRun(run: CanvasRun) {
  const now = new Date().toISOString();
  run = await saveCanvasRunToDb({ ...run, status: "running", startedAt: run.startedAt || now, updatedAt: now });
  const plan = buildCanvasRunPlan(run.graphSnapshot, run.targetNodeIds);
  const stepMap = new Map((run.steps || plan.steps).map((step) => [step.nodeId, step]));
  const included = new Set(plan.includedNodeIds);
  const retry = new Set(run.retryNodeIds || []);
  const allAttempts = await listCanvasNodeRunsFromDb(run.id);
  const latest = latestNodeRuns(allAttempts);
  const outputs = new Map<string, Record<string, CanvasArtifact>>();
  for (const [nodeId, nodeRun] of latest) {
    if (included.has(nodeId) && !retry.has(nodeId) && isOutputStatus(nodeRun.status)) outputs.set(nodeId, nodeRun.outputs);
  }

  const pending = new Set(plan.includedNodeIds.filter((id) => !outputs.has(id)));
  while (pending.size) {
    const refreshed = await getCanvasRunFromDb(run.id);
    if (refreshed?.cancelRequestedAt) {
      return finishCancelledRun(refreshed, pending, latest);
    }
    const ready = Array.from(pending).filter((nodeId) => dependencies(run.graphSnapshot.edges, nodeId)
      .every((id) => outputs.has(id) || isTerminalNodeStatus(latest.get(id)?.status)));
    if (!ready.length) break;
    const results = await Promise.all(ready.map((nodeId) => runPlannedNode(
      run,
      findNode(run.graphSnapshot.nodes, nodeId),
      stepMap.get(nodeId) || { nodeId, action: "execute" },
      latest,
      outputs,
    )));
    for (const result of results) {
      latest.set(result.nodeId, result.nodeRun);
      if (isOutputStatus(result.nodeRun.status)) outputs.set(result.nodeId, result.nodeRun.outputs);
      pending.delete(result.nodeId);
    }
  }

  const relevant = plan.includedNodeIds.map((id) => latest.get(id)).filter((item): item is CanvasNodeRun => Boolean(item));
  const hasPendingProvider = relevant.some((item) => item.status === "running" && item.providerTaskId);
  const failures = relevant.filter((item) => isFailure(item.status));
  const completed = relevant.filter((item) => isSuccessfulNodeStatus(item.status));
  const finishedAt = new Date().toISOString();
  const status: CanvasRun["status"] = hasPendingProvider
    ? "running"
    : failures.length
      ? completed.length ? "partial" : "failed"
      : completed.length === plan.includedNodeIds.length ? "completed" : "failed";
  return saveCanvasRunToDb({
    ...run,
    status,
    retryNodeIds: hasPendingProvider ? run.retryNodeIds : undefined,
    error: status === "running"
      ? undefined
      : failures[0]?.error || (status === "failed" ? "Canvas run could not make progress." : undefined),
    updatedAt: finishedAt,
    ...(status === "running" ? {} : { completedAt: finishedAt }),
  });
}

async function runPlannedNode(
  run: CanvasRun,
  node: CanvasNode,
  step: CanvasRunPlanStep,
  latest: Map<string, CanvasNodeRun>,
  outputs: Map<string, Record<string, CanvasArtifact>>,
) {
  const inputs = collectInputs(run.graphSnapshot.edges, node.id, outputs);
  if (step.action === "disabled") {
    const nodeRun = await saveTerminalNodeRun(run, node, latest, "disabled", {}, undefined, inputs);
    return { nodeId: node.id, nodeRun };
  }
  if (step.action === "blocked") {
    const nodeRun = await saveTerminalNodeRun(run, node, latest, "blocked", {}, step.message || "Canvas node was blocked during preflight.", inputs);
    return { nodeId: node.id, nodeRun };
  }
  if (step.action === "reuse") return runReusedNode(run, node, step, latest, inputs);
  if (step.action === "bypass") return runBypassedNode(run, node, latest, inputs);
  const missingInput = missingRequiredInput(node, inputs);
  if (missingInput) {
    const definition = getCanvasNodeDefinition(node.type, node.version);
    const nodeRun = await saveTerminalNodeRun(
      run,
      node,
      latest,
      "blocked",
      {},
      `${definition?.label || node.id}: Missing required input ${missingInput}.`,
      inputs,
    );
    return { nodeId: node.id, nodeRun };
  }
  return runReadyNode(run, node, latest, inputs);
}

async function runReusedNode(
  run: CanvasRun,
  node: CanvasNode,
  step: CanvasRunPlanStep,
  latest: Map<string, CanvasNodeRun>,
  inputs: Record<string, CanvasArtifact[]>,
) {
  const [source, sourceRun] = await Promise.all([
    step.sourceNodeRunId ? getCanvasNodeRunFromDb(step.sourceNodeRunId) : undefined,
    step.sourceRunId ? getCanvasRunFromDb(step.sourceRunId) : undefined,
  ]);
  if (!source || !sourceRun || !step.sourceRunId || !Object.keys(source.outputs).length) {
    const nodeRun = await saveTerminalNodeRun(run, node, latest, "blocked", {}, "Reusable canvas result is no longer available.", inputs);
    return { nodeId: node.id, nodeRun };
  }
  const now = new Date().toISOString();
  const nodeRun = await saveCanvasNodeRunToDb({
    id: `canvas-node-run-${randomUUID()}`,
    runId: run.id,
    nodeId: node.id,
    nodeType: node.type,
    attempt: (latest.get(node.id)?.attempt || 0) + 1,
    status: "reused",
    inputs,
    outputs: structuredClone(source.outputs),
    inputFingerprint: fingerprintCanvasNodeExecution(node, inputs),
    reusedFrom: { runId: step.sourceRunId, nodeRunId: source.id, workflowRevision: sourceRun.workflowRevision },
    createdAt: now,
    updatedAt: now,
    completedAt: now,
  });
  return { nodeId: node.id, nodeRun };
}

async function runBypassedNode(
  run: CanvasRun,
  node: CanvasNode,
  latest: Map<string, CanvasNodeRun>,
  inputs: Record<string, CanvasArtifact[]>,
) {
  const bypassOutputs = resolveBypassOutputs(node, inputs);
  if (!bypassOutputs) {
    const nodeRun = await saveTerminalNodeRun(run, node, latest, "blocked", {}, "Bypass input is unavailable.", inputs);
    return { nodeId: node.id, nodeRun };
  }
  const now = new Date().toISOString();
  const nodeRun = await saveCanvasNodeRunToDb({
    id: `canvas-node-run-${randomUUID()}`,
    runId: run.id,
    nodeId: node.id,
    nodeType: node.type,
    attempt: (latest.get(node.id)?.attempt || 0) + 1,
    status: "bypassed",
    inputs,
    outputs: bypassOutputs,
    inputFingerprint: fingerprintCanvasNodeExecution(node, inputs),
    createdAt: now,
    updatedAt: now,
    completedAt: now,
  });
  return { nodeId: node.id, nodeRun };
}

async function runReadyNode(
  run: CanvasRun,
  node: CanvasNode,
  latest: Map<string, CanvasNodeRun>,
  inputs: Record<string, CanvasArtifact[]>,
) {
  const previousNodeRun = latest.get(node.id);
  const resumableNodeRun = previousNodeRun?.status === "running" && previousNodeRun.providerTaskId
    ? previousNodeRun
    : undefined;
  const attempt = resumableNodeRun?.attempt || (previousNodeRun?.attempt || 0) + 1;
  const startedAt = new Date().toISOString();
  let nodeRun: CanvasNodeRun = resumableNodeRun || await saveCanvasNodeRunToDb({
    id: `canvas-node-run-${randomUUID()}`,
    runId: run.id,
    nodeId: node.id,
    nodeType: node.type,
    attempt,
    status: "running",
    inputs,
    outputs: {},
    createdAt: startedAt,
    updatedAt: startedAt,
    startedAt,
  });
  try {
    const result = await executeCanvasNode({
      runId: run.id,
      node,
      inputs,
      account: { id: run.ownerUserId, displayName: run.ownerDisplayName, role: "operator" },
      previousNodeRun,
      onProviderTaskUpdate: async (state) => {
        const updatedAt = new Date().toISOString();
        nodeRun = {
          ...nodeRun,
          providerTaskId: state.taskId,
          providerTaskRoute: state.route,
          providerStatus: state.status,
          updatedAt,
        };
        await saveCanvasNodeRunToDb(nodeRun);
      },
    });
    const endedAt = new Date().toISOString();
    nodeRun = await saveCanvasNodeRunToDb({
      ...nodeRun,
      status: result.pending ? "running" : "completed",
      inputs: result.resolvedInputs || inputs,
      outputs: result.outputs,
      providerTaskId: result.providerTaskId || nodeRun.providerTaskId,
      providerTaskRoute: result.providerTaskRoute || nodeRun.providerTaskRoute,
      providerStatus: result.providerStatus || nodeRun.providerStatus,
      inputFingerprint: fingerprintCanvasNodeExecution(node, inputs),
      updatedAt: endedAt,
      ...(result.pending ? {} : { completedAt: endedAt }),
    });
  } catch (error) {
    const endedAt = new Date().toISOString();
    nodeRun = await saveCanvasNodeRunToDb({
      ...nodeRun,
      status: error instanceof CanvasNeedsConfigError ? "needs_config" : "failed",
      error: error instanceof Error ? error.message : "Canvas node failed",
      updatedAt: endedAt,
      completedAt: endedAt,
    });
  }
  return { nodeId: node.id, nodeRun };
}

async function finishCancelledRun(run: CanvasRun, pending: Set<string>, latest: Map<string, CanvasNodeRun>) {
  for (const nodeId of pending) {
    const node = findNode(run.graphSnapshot.nodes, nodeId);
    const nodeRun = await saveTerminalNodeRun(run, node, latest, "cancelled", {}, "Run cancelled before this node started.");
    latest.set(nodeId, nodeRun);
  }
  const now = new Date().toISOString();
  return saveCanvasRunToDb({ ...run, status: "cancelled", updatedAt: now, completedAt: now });
}

async function saveTerminalNodeRun(
  run: CanvasRun,
  node: CanvasNode,
  latest: Map<string, CanvasNodeRun>,
  status: CanvasNodeRunStatus,
  outputs: Record<string, CanvasArtifact>,
  error?: string,
  inputs: Record<string, CanvasArtifact[]> = {},
) {
  const now = new Date().toISOString();
  return saveCanvasNodeRunToDb({
    id: `canvas-node-run-${randomUUID()}`,
    runId: run.id,
    nodeId: node.id,
    nodeType: node.type,
    attempt: (latest.get(node.id)?.attempt || 0) + 1,
    status,
    inputs,
    outputs,
    ...(error ? { error } : {}),
    createdAt: now,
    updatedAt: now,
    completedAt: now,
  });
}

function collectInputs(edges: CanvasEdge[], targetNodeId: string, outputs: Map<string, Record<string, CanvasArtifact>>) {
  const result: Record<string, CanvasArtifact[]> = {};
  for (const edge of edges.filter((item) => item.target === targetNodeId)) {
    const artifact = outputs.get(edge.source)?.[edge.sourcePort];
    if (artifact) (result[edge.targetPort] ||= []).push(artifact);
  }
  return result;
}

function missingRequiredInput(node: CanvasNode, inputs: Record<string, CanvasArtifact[]>) {
  const definition = getCanvasNodeDefinition(node.type, node.version);
  const requiredInputs = getCanvasNodeExecutionMode(node) === "bypass"
    ? definition?.inputs.filter((input) => input.id === definition.bypass?.inputPort)
    : definition?.inputs.filter((input) => input.required);
  return requiredInputs?.find((input) => !(inputs[input.id] || []).length)?.label;
}

function resolveBypassOutputs(node: CanvasNode, inputs: Record<string, CanvasArtifact[]>): Record<string, CanvasArtifact> | undefined {
  const bypass = getCanvasNodeDefinition(node.type, node.version)?.bypass;
  if (!bypass) return undefined;
  const artifact = mergeArtifacts(inputs[bypass.inputPort] || []);
  return artifact ? { [bypass.outputPort]: artifact } : undefined;
}

function mergeArtifacts(artifacts: CanvasArtifact[]): CanvasArtifact | undefined {
  const first = artifacts[0];
  if (!first || artifacts.some((artifact) => artifact.kind !== first.kind)) return undefined;
  if (first.kind === "text") {
    return { kind: "text", value: artifacts.map((artifact) => artifact.kind === "text" ? artifact.value : "").filter(Boolean).join("\n\n") };
  }
  if (first.kind === "images") {
    return { kind: "images", items: artifacts.flatMap((artifact) => artifact.kind === "images" ? artifact.items : []) };
  }
  if (first.kind === "videos") {
    return { kind: "videos", items: artifacts.flatMap((artifact) => artifact.kind === "videos" ? artifact.items : []) };
  }
  return structuredClone(first);
}

function fingerprintCanvasNodeExecution(node: CanvasNode, inputs: Record<string, CanvasArtifact[]>) {
  const value = {
    node: { id: node.id, type: node.type, version: node.version, config: node.config, executionMode: getCanvasNodeExecutionMode(node) },
    inputs: normalizeFingerprintInputs(node, inputs),
  };
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

function normalizeFingerprintInputs(node: CanvasNode, inputs: Record<string, CanvasArtifact[]>) {
  const directReferences = node.type === "model.gpt-image" && node.version >= 2
    ? new Set(normalizeUrlList(node.config.referenceUrls))
    : new Set<string>();
  const result: Record<string, CanvasArtifact[]> = {};
  for (const [port, artifacts] of Object.entries(inputs)) {
    const textValues: string[] = [];
    const imageItems: Extract<CanvasArtifact, { kind: "images" }>["items"] = [];
    const videoItems: Extract<CanvasArtifact, { kind: "videos" }>["items"] = [];
    const passthrough: CanvasArtifact[] = [];
    for (const artifact of artifacts) {
      if (artifact.kind === "text" && artifact.value.trim()) textValues.push(artifact.value);
      if (artifact.kind === "images") {
        const items = artifact.items.filter((item) => !(port === "references" && directReferences.has(item.url)));
        imageItems.push(...items);
      }
      if (artifact.kind === "videos") videoItems.push(...artifact.items);
      if (artifact.kind === "socialPost" || artifact.kind === "publishJobRef") passthrough.push(artifact);
    }
    const normalized: CanvasArtifact[] = [
      ...(textValues.length ? [{ kind: "text" as const, value: textValues.join("\n\n") }] : []),
      ...(imageItems.length ? [{ kind: "images" as const, items: imageItems }] : []),
      ...(videoItems.length ? [{ kind: "videos" as const, items: videoItems }] : []),
      ...passthrough,
    ];
    if (normalized.length) result[port] = normalized;
  }
  return result;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function dependencies(edges: CanvasEdge[], nodeId: string) {
  return Array.from(new Set(edges.filter((edge) => edge.target === nodeId).map((edge) => edge.source)));
}

function latestNodeRuns(nodeRuns: CanvasNodeRun[]) {
  const latest = new Map<string, CanvasNodeRun>();
  for (const nodeRun of nodeRuns) {
    const previous = latest.get(nodeRun.nodeId);
    if (!previous || nodeRun.attempt > previous.attempt) latest.set(nodeRun.nodeId, nodeRun);
  }
  return latest;
}

function findNode(nodes: CanvasNode[], nodeId: string) {
  const node = nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error(`Canvas node ${nodeId} was not found in the run snapshot.`);
  return node;
}

function isFailure(status?: CanvasNodeRunStatus) {
  return status === "failed" || status === "blocked" || status === "needs_config" || status === "cancelled";
}

function isOutputStatus(status?: CanvasNodeRunStatus) {
  return status === "completed" || status === "reused" || status === "bypassed";
}

function isSuccessfulNodeStatus(status?: CanvasNodeRunStatus) {
  return isOutputStatus(status) || status === "disabled";
}

function isTerminalNodeStatus(status?: CanvasNodeRunStatus) {
  return isSuccessfulNodeStatus(status) || isFailure(status);
}

function sameStringSet(left: string[], right: string[]) {
  const a = Array.from(new Set(left)).sort();
  const b = Array.from(new Set(right)).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
