import { enqueueCanvasRunQueueItem, getCanvasRunFromDb, listCanvasNodeRunsFromDb, requeueCanvasRunQueueItem, saveCanvasRunToDb } from "../database";
import { getGeneratedPost } from "../generated-posts";
import type { WorkspaceAccessActor } from "../workspace-ownership";
import { buildCanvasRunPlan, collectDescendants } from "./graph";
import { latestAttempts } from "./iteration-runtime";
import { getCanvasNodeDefinition } from "./registry";
import { ensureCanvasRunWorker, getCanvasRun, retryCanvasNode } from "./runs";
import { refreshCanvasScheduleIterationResult } from "./scheduler";

export async function getCanvasIterationDetails(runId: string, nodeId: string, account: WorkspaceAccessActor) {
  const current = await getCanvasRun(runId, account);
  if (!current || current.run.iterationContext) throw new Error("Iteration run not found.");
  const nodeRun = latestAttempts(current.nodeRuns).get(nodeId);
  const metadata = nodeRun?.internalMetadata?.iteration;
  if (!metadata) throw new Error("Iteration has not started.");
  const items = await Promise.all(metadata.items.map(async (item) => {
    const child = await getCanvasRunFromDb(item.runId);
    if (child && (child.ownerUserId !== current.run.ownerUserId || child.iterationContext?.parentRunId !== runId || child.iterationContext.regionNodeId !== nodeId)) {
      throw new Error("Iteration child identity mismatch.");
    }
    return { item: child ? { ...item, status: child.status, error: child.error } : item, nodeRuns: child ? await listCanvasNodeRunsFromDb(child.id) : [] };
  }));
  return { metadata, items };
}

export async function updateCanvasIteration(runId: string, nodeId: string, action: string, account: WorkspaceAccessActor) {
  if (action === "retry-failed") return retryCanvasNode(runId, nodeId, account);
  if (action !== "refresh-downstream") throw new Error("Unsupported iteration action.");
  const current = await getCanvasRun(runId, account);
  if (!current || current.run.iterationContext) throw new Error("Iteration run not found.");
  if (["running", "queued", "cancelled"].includes(current.run.status)) throw new Error("Wait for the iteration to finish before refreshing.");
  if (current.run.batchContext?.schemaVersion === 2 && current.run.batchContext.phase === "shared") throw new Error("Shared results are frozen. Start a new schedule.");
  const attempts = latestAttempts(current.nodeRuns);
  const region = attempts.get(nodeId);
  if (!region?.internalMetadata?.iteration?.downstreamStale) throw new Error("Iteration downstream is already current.");
  if (current.run.batchContext) await refreshCanvasScheduleIterationResult(current.run, nodeId, account, true);
  const graph = current.run.graphSnapshot;
  const descendants = collectDescendants(graph, [nodeId]);
  const external = graph.nodes.filter((node) => getCanvasNodeDefinition(node.type, node.version)?.capability === "external_write").map((node) => node.id);
  const excluded = collectDescendants(graph, external);
  const originalPlan = buildCanvasRunPlan(graph, current.run.targetNodeIds);
  const targets = originalPlan.includedNodeIds.filter((id) => !excluded.has(id));
  const retryNodeIds = targets.filter((id) => id !== nodeId && descendants.has(id));
  for (const id of retryNodeIds) {
    for (const artifact of Object.values(attempts.get(id)?.outputs || {})) {
      if (artifact.kind === "socialPost" && (await getGeneratedPost(artifact.postId, account))?.status === "published") {
        throw new Error("Published content cannot be overwritten. Start a new run.");
      }
    }
  }
  const plan = buildCanvasRunPlan(graph, targets);
  if (plan.blockers.length) throw new Error(plan.blockers[0].message);
  const now = new Date().toISOString();
  const run = await saveCanvasRunToDb({
    ...current.run, status: "queued", retryNodeIds, targetNodeIds: targets, steps: plan.steps,
    iterationRefreshRegionIds: [nodeId], error: undefined, completedAt: undefined, updatedAt: now,
  });
  if (!await requeueCanvasRunQueueItem(run.id)) await enqueueCanvasRunQueueItem(run);
  ensureCanvasRunWorker();
  return run;
}
