import { createHash } from "node:crypto";
import { enqueueCanvasRunQueueItem, getCanvasRunFromDb, holdCanvasIterationItemQueue, listCanvasNodeRunsFromDb, saveCanvasRunToDb, wakeCanvasIterationRun } from "../database";
import { buildCanvasRunPlan, collectDescendants } from "./graph";
import type { CanvasNodeExecutionResult } from "./executors";
import type { CanvasArtifact, CanvasIterationItem, CanvasIterationRunMetadata, CanvasNode, CanvasNodeRun, CanvasRun } from "./types";

type RegionContext = {
  run: CanvasRun;
  node: CanvasNode;
  inputs: Record<string, CanvasArtifact[]>;
  previousNodeRun?: CanvasNodeRun;
  saveMetadata: (metadata: CanvasIterationRunMetadata) => Promise<void>;
};

export async function executeCanvasIteration(context: RegionContext): Promise<CanvasNodeExecutionResult> {
  const { run, node, inputs } = context;
  if (node.frozenOutputs) return { outputs: node.frozenOutputs };
  const definition = node.iteration;
  if (!definition) throw new Error("Iteration region has no inner workflow.");
  const sources = (inputs.images || []).flatMap((artifact) => artifact.kind === "images" ? artifact.items : []);
  if (!sources.length || sources.length > 18) throw new Error("Iteration accepts 1 to 18 images.");
  const concurrency = Number(node.config.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 20) throw new Error("Iteration concurrency must be between 1 and 20.");
  const inputFingerprint = fingerprint({ definition, inputs, failurePolicy: node.config.failurePolicy });
  let metadata = context.previousNodeRun?.internalMetadata?.iteration;
  if (metadata && metadata.inputFingerprint !== inputFingerprint) throw new Error("Iteration inputs changed. Start a new run.");
  if (!metadata) {
    metadata = {
      schemaVersion: 1, inputFingerprint, revision: 0,
      items: sources.map((source, index) => {
        const id = fingerprint({ runId: run.id, nodeId: node.id, inputFingerprint, index });
        return { id, index, source, runId: `canvas-iteration-${id}`, status: "queued" };
      }),
    };
    await context.saveMetadata(metadata);
  } else metadata = structuredClone(metadata);

  const targets = Object.values(definition.outputs).map((output) => output.nodeId);
  if (!targets.length) throw new Error("Select at least one iteration output.");
  const existing = new Map<string, CanvasRun>();
  for (const item of metadata.items) {
    const child = await getCanvasRunFromDb(item.runId);
    if (!child) continue;
    assertChildIdentity(child, run, node, item);
    existing.set(item.id, child);
    item.status = child.status;
    item.error = child.error;
    if (child.status === "completed") {
      const attempts = latestAttempts(await listCanvasNodeRunsFromDb(child.id));
      const outputs: NonNullable<CanvasIterationItem["outputs"]> = {};
      for (const kind of ["text", "images"] as const) {
        const selected = definition.outputs[kind];
        if (!selected) continue;
        const artifact = attempts.get(selected.nodeId)?.outputs[selected.outputPort];
        if (!artifact || artifact.kind !== kind || (artifact.kind === "images" && !artifact.items.length)) {
          throw new Error(`Iteration item ${item.index + 1} did not produce its configured ${kind} output.`);
        }
        outputs[kind] = artifact;
      }
      item.outputs = outputs;
    }
  }

  for (const child of existing.values()) {
    if (child.status === "queued" && !child.iterationAdmissionPending) {
      await enqueueCanvasRunQueueItem(child);
      await wakeCanvasIterationRun(child.id);
    }
  }

  let available = Math.max(0, concurrency - [...existing.values()].filter((child) => child.status === "running" || (child.status === "queued" && !child.iterationAdmissionPending)).length);
  for (const item of metadata.items) {
    if (available === 0) break;
    if (item.status !== "queued") continue;
    if (existing.has(item.id) && !existing.get(item.id)!.iterationAdmissionPending) continue;
    const parent = await getCanvasRunFromDb(run.id);
    if (parent?.cancelRequestedAt) break;
    let child = existing.get(item.id);
    if (!child) {
      const graph = structuredClone(definition.graph);
      const plan = buildCanvasRunPlan(graph, targets);
      if (plan.blockers.length) throw new Error(plan.blockers[0].message);
      const now = new Date().toISOString();
      child = await saveCanvasRunToDb({
        id: item.runId, workflowId: run.workflowId, workflowRevision: run.workflowRevision,
        ownerUserId: run.ownerUserId, ownerDisplayName: run.ownerDisplayName,
        status: "queued", graphSnapshot: graph, targetNodeIds: targets, steps: plan.steps,
        runMode: "with-upstream", confirmation: structuredClone(run.confirmation),
        iterationContext: { parentRunId: run.id, regionNodeId: node.id, itemId: item.id, index: item.index },
        iterationInputs: {
          images: { kind: "images", items: [item.source] },
          index: { kind: "text", value: String(item.index + 1) },
          text: { kind: "text", value: (inputs.text || []).flatMap((artifact) => artifact.kind === "text" ? [artifact.value] : []).join("\n\n") },
          references: { kind: "images", items: (inputs.references || []).flatMap((artifact) => artifact.kind === "images" ? artifact.items : []) },
        },
        createdAt: now, updatedAt: now,
      });
    }
    if (child.iterationAdmissionPending) child = await saveCanvasRunToDb({ ...child, iterationAdmissionPending: undefined });
    await enqueueCanvasRunQueueItem(child);
    await wakeCanvasIterationRun(child.id);
    available -= 1;
  }
  const pending = metadata.items.some((item) => item.status === "queued" || item.status === "running");
  await context.saveMetadata(metadata);
  if (pending) return { outputs: {}, pending: true, internalMetadata: { iteration: metadata }, waitReason: "Waiting for image items" };

  const successful = metadata.items.filter((item) => item.status === "completed");
  const failures = metadata.items.length - successful.length;
  if (!successful.length || (failures && node.config.failurePolicy === "all")) {
    return { outputs: {}, failure: `Iteration incomplete: ${successful.length}/${metadata.items.length} images succeeded. Retry failed items.`, internalMetadata: { iteration: metadata } };
  }
  const outputs: Record<string, CanvasArtifact> = {};
  if (definition.outputs.text) outputs.text = {
    kind: "text", value: successful.map((item) => {
      const artifact = item.outputs?.text;
      return `[Image ${item.index + 1}]\n${artifact?.kind === "text" ? artifact.value : ""}`;
    }).join("\n\n"),
  };
  if (definition.outputs.images) outputs.images = {
    kind: "images", items: successful.flatMap((item) => item.outputs?.images?.kind === "images" ? item.outputs.images.items : []),
  };
  const outputFingerprint = fingerprint(outputs);
  const changed = outputFingerprint !== metadata.outputFingerprint;
  metadata.outputFingerprint = outputFingerprint;
  if (changed) metadata.revision += 1;
  if (metadata.deliveredRevision === undefined) metadata.deliveredRevision = metadata.revision;
  else if (metadata.revision !== metadata.deliveredRevision) metadata.downstreamStale = true;
  await context.saveMetadata(metadata);
  return { outputs, internalMetadata: { iteration: metadata } };
}

export async function resetCanvasIterationFailures(run: CanvasRun, nodeRun: CanvasNodeRun) {
  const metadata = nodeRun.internalMetadata?.iteration;
  if (!metadata) throw new Error("Iteration has no items to retry.");
  let retried = 0;
  const pendingResets: Array<{ item: CanvasIterationItem; child: CanvasRun; retryNodeIds: string[] }> = [];
  for (const item of metadata.items) {
    const child = await getCanvasRunFromDb(item.runId);
    if (!child) {
      item.status = "queued";
      retried += 1;
      continue;
    }
    if (child.status === "completed") continue;
    assertChildIdentity(child, run, { id: nodeRun.nodeId }, item);
    if (child.status === "queued" && child.iterationAdmissionPending) { retried += 1; continue; }
    if (child.status === "running" || child.status === "queued") throw new Error("Iteration is still running.");
    const attempts = latestAttempts(await listCanvasNodeRunsFromDb(child.id));
    const failed = [...attempts.values()].filter((attempt) => ["failed", "blocked", "needs_config", "cancelled"].includes(attempt.status)).map((attempt) => attempt.nodeId);
    const roots = failed.length ? failed : child.graphSnapshot.nodes.filter((node) => !attempts.has(node.id)).map((node) => node.id);
    if (!roots.length) throw new Error("Iteration item has no safe retry target. Start a new run.");
    const retryNodeIds = [...collectDescendants(child.graphSnapshot, roots)];
    pendingResets.push({ item, child, retryNodeIds });
  }
  for (const { item, child, retryNodeIds } of pendingResets) {
    const now = new Date().toISOString();
    await holdCanvasIterationItemQueue(child.id);
    await saveCanvasRunToDb({ ...child, status: "queued", iterationAdmissionPending: true, retryNodeIds, error: undefined, completedAt: undefined, cancelRequestedAt: undefined, updatedAt: now }, { resetCancellation: true });
    item.status = "queued";
    item.error = undefined;
    retried += 1;
  }
  return retried;
}

export function latestAttempts(attempts: CanvasNodeRun[]) {
  const latest = new Map<string, CanvasNodeRun>();
  for (const attempt of attempts) if (!latest.has(attempt.nodeId) || latest.get(attempt.nodeId)!.attempt < attempt.attempt) latest.set(attempt.nodeId, attempt);
  return latest;
}

function assertChildIdentity(child: CanvasRun, parent: CanvasRun, region: Pick<CanvasNode, "id">, item: CanvasIterationItem) {
  const context = child.iterationContext;
  if (child.ownerUserId !== parent.ownerUserId || context?.parentRunId !== parent.id || context.regionNodeId !== region.id || context.itemId !== item.id) {
    throw new Error("Iteration child identity mismatch.");
  }
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
