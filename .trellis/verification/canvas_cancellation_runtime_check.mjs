import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const clone = (value) => value === undefined ? value : structuredClone(value);
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Cancellation did not release Canvas workers")), 5_000); })]); }
  finally { clearTimeout(timer); }
}
function load(file, modules) {
  const loaded = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  Function("require", "module", "exports", compiled)((name) => {
    if (name in modules) return modules[name];
    if (name.startsWith("node:")) return require(name);
    throw new Error(`Unexpected dependency: ${name}`);
  }, loaded, loaded.exports);
  return loaded.exports;
}
const concurrency = load("src/lib/concurrency.ts", {});
const records = new Map();
const nodes = new Map();
const queue = new Map();
const enteredA = deferred(), enteredB = deferred(), completedC = deferred();
const enteredD = deferred(), releaseD = deferred(), completedD = deferred();
const account = { id: "owner", role: "operator", displayName: "Owner" };
const publications = [];
const graph = { nodes: [{ id: "image", type: "utility.image-process", config: {} }, { id: "publish", type: "publish.feishu", config: {} }], edges: [{ source: "image", sourcePort: "images", target: "publish", targetPort: "images" }] };
for (const id of ["A", "B", "C"]) {
  records.set(id, { id, workflowId: "workflow", workflowRevision: 1, ownerUserId: "owner", ownerDisplayName: "Owner", graphSnapshot: graph, status: "queued", targetNodeIds: ["publish"], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  queue.set(id, { id, runId: id, status: "queued" });
}
const database = {
  getCanvasRunFromDb: async (id) => clone(records.get(id)),
  listCanvasNodeRunsFromDb: async (id) => clone([...nodes.values()].filter((node) => node.runId === id)),
  saveCanvasRunToDb: async (run) => {
    const saved = records.get(run.id)?.status === "cancelled" ? records.get(run.id) : run;
    records.set(run.id, clone(saved)); return clone(saved);
  },
  saveCanvasNodeRunToDb: async (node) => {
    const saved = nodes.get(node.id)?.status === "cancelled" ? nodes.get(node.id)
      : records.get(node.runId)?.status === "cancelled" ? { ...node, status: "cancelled" } : node;
    nodes.set(node.id, clone(saved)); return clone(saved);
  },
  saveCancelledCanvasNodeReceiptInDb: async (node) => {
    const current = nodes.get(node.id);
    if (current?.status !== "cancelled") return;
    if (node.providerTaskId) Object.assign(current, { providerTaskId: node.providerTaskId });
    if (node.nodeType === "publish.feishu" && node.outputs.job?.kind === "publishJobRef") current.outputs.job ||= clone(node.outputs.job);
  },
  cancelCanvasRunInDb: async (id) => {
    const saved = { ...records.get(id), status: "cancelled", cancelRequestedAt: new Date().toISOString() };
    records.set(id, saved);
    queue.set(id, { ...queue.get(id), status: "cancelled" });
    for (const [key, node] of nodes) if (node.runId === id && node.status === "running") nodes.set(key, { ...node, status: "cancelled" });
    return clone(saved);
  },
  claimNextCanvasRunQueueItem: async (workerId) => {
    const item = [...queue.values()].find((row) => row.status === "queued");
    if (!item) return;
    item.status = "running"; item.lockedBy = workerId; return clone(item);
  },
  heartbeatCanvasRunQueueItem: async () => {},
  finishCanvasRunQueueItem: async (id, workerId, status) => {
    const row = queue.get(id);
    if (row.status === "running" && row.lockedBy === workerId) row.status = status;
    if (id === "C" && status === "completed") completedC.resolve();
    if (id === "D" && status === "cancelled") completedD.resolve();
  },
  recoverCanvasIterationRuns: async () => {},
  requeueExpiredCanvasRunQueueItemsWithProviderTasks: async () => {},
};
const runtime = load("src/lib/canvas/runs.ts", {
  "../database": database,
  "../activity-log": { recordExecutionLog: async () => {} },
  "../workspace-ownership": { canAccessWorkspaceOwner: (actor, owner) => actor.id === owner },
  "../concurrency": { concurrencyConfig: { canvasRun: 2 } },
  "../image-transport": { isImageNetworkUnavailableError: () => false },
  "./executors": { CanvasNeedsConfigError: class extends Error {}, executeCanvasNode: async ({ runId, node, signal, onProviderTaskUpdate }) => {
    if (node.type === "publish.feishu") {
      publications.push(runId);
      if (runId === "D") {
        enteredD.resolve(); await releaseD.promise;
        await onProviderTaskUpdate({ taskId: "accepted-task", route: "primary", status: "accepted" });
        return { outputs: { job: { kind: "publishJobRef", jobId: "accepted-job", status: "queued" } } };
      }
      return { outputs: { post: { kind: "text", value: "mock receipt" } } };
    }
    assert.ok(signal instanceof AbortSignal, "run cancellation reaches the executor");
    if (runId === "B") enteredB.resolve();
    return concurrency.runWithConcurrencyPool("localImage", async () => {
      if (runId === "A") {
        enteredA.resolve();
        await new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
      }
      return { outputs: { images: { kind: "images", items: [{ url: "/generated/mock.jpg" }] } } };
    }, { signal });
  } },
  "./layer-compose-contract": {}, "./iteration": {}, "./seedance": {},
  "./graph": { buildCanvasRunPlan: () => ({ includedNodeIds: ["image", "publish"], steps: [], blockers: [] }) },
  "./registry": { getCanvasNodeDefinition: () => ({ inputs: [] }), getCanvasRequiredInputPorts: () => [], getCanvasNodeExecutionMode: () => "enabled", normalizeUrlList: () => [] },
  "./workflows": {}, "./iteration-runtime": {},
});

try {
  runtime.ensureCanvasRunWorker();
  await bounded(Promise.all([enteredA.promise, enteredB.promise]));
  assert.equal(queue.get("C").status, "queued");
  assert.deepEqual(concurrency.getConcurrencySnapshot().localImage, { limit: 1, active: 1, queued: 1 });
  await assert.rejects(runtime.cancelCanvasRun("A", { id: "other" }), /not found/);
  await runtime.cancelCanvasRun("B", account);
  assert.equal(records.get("B").status, "cancelled");
  assert.equal(concurrency.getConcurrencySnapshot().localImage.queued, 0, "cancelled resource waiter is removed immediately");
  await assert.rejects(runtime.retryCanvasNode("A", "image", account), /previous Canvas execution/, "an executing run cannot be reset into a competing attempt");
  await runtime.cancelCanvasRun("A", account);
  await bounded(completedC.promise);
  await new Promise(setImmediate);
  assert.deepEqual(publications, ["C"], "cancelled runs cannot execute publishing; later queued work completes");
  for (const id of ["A", "B"]) {
    assert.equal(records.get(id).status, "cancelled");
    assert.equal(queue.get(id).status, "cancelled");
    assert.ok([...nodes.values()].filter((node) => node.runId === id).every((node) => node.status === "cancelled"));
  }
  assert.equal(records.get("C").status, "completed");
  assert.equal(globalThis.__fluxpostCanvasQueue.activeWorkers, 0);
  assert.deepEqual(concurrency.getConcurrencySnapshot().localImage, { limit: 1, active: 0, queued: 0 });
  await runtime.cancelCanvasRun("A", account);
  await runtime.cancelCanvasRun("C", account);
  assert.equal(records.get("C").status, "completed", "cancellation preserves completed work");
  records.set("D", { ...records.get("C"), id: "D", status: "queued" });
  queue.set("D", { id: "D", runId: "D", status: "queued" });
  runtime.ensureCanvasRunWorker();
  await bounded(enteredD.promise);
  await runtime.cancelCanvasRun("D", account);
  await assert.rejects(runtime.retryCanvasNode("D", "publish", account), /previous Canvas execution/, "cancelled state cannot be retried while its external request is still executing");
  releaseD.resolve();
  await bounded(completedD.promise);
  const lateReceipt = [...nodes.values()].find((node) => node.runId === "D" && node.nodeId === "publish");
  assert.equal(lateReceipt.status, "cancelled");
  assert.equal(lateReceipt.providerTaskId, "accepted-task", "late provider acknowledgment survives cancellation");
  assert.equal(lateReceipt.outputs.job.jobId, "accepted-job", "durable publish receipt survives cancellation during enqueue");
  assert.equal(records.get("D").status, "cancelled");
  console.log("Canvas cancellation runtime: owner guard, cancelled active/waiting work, no downstream publish, idempotency and queued-batch progress passed.");
} finally {
  for (const controller of globalThis.__fluxpostCanvasExecutions?.values() || []) controller.abort(new Error("Fixture cleanup"));
}
