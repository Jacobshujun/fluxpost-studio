import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
const records = new Map();
const nodeRecords = new Map();
const calls = [];
const clone = (value) => value === undefined ? value : structuredClone(value);
const latest = (runId) => [...nodeRecords.values()].filter((attempt) => attempt.runId === runId);
const descendants = (graph, ids) => {
  const result = new Set(ids);
  let changed = true;
  while (changed) { changed = false; for (const edge of graph.edges) if (result.has(edge.source) && !result.has(edge.target)) { result.add(edge.target); changed = true; } }
  return result;
};
const database = {
  getCanvasRunFromDb: async (id) => clone(records.get(id)),
  saveCanvasRunToDb: async (run) => { records.set(run.id, clone(run)); return clone(run); },
  listCanvasNodeRunsFromDb: async (id) => clone(latest(id)),
  saveCanvasNodeRunToDb: async (attempt) => { nodeRecords.set(attempt.id, clone(attempt)); return clone(attempt); },
  enqueueCanvasRunQueueItem: async () => {}, wakeCanvasIterationRun: async () => {},
};
function load(relative, modules, extra = "") {
  const compiled = ts.transpileModule(readFileSync(relative, "utf8") + extra, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    if (Object.hasOwn(modules, name)) return modules[name];
    if (name.startsWith("node:")) return nativeRequire(name);
    throw new Error(`Unexpected import ${name}`);
  }, loaded, loaded.exports);
  return loaded.exports;
}
const graphModule = {
  collectDescendants: descendants,
  buildCanvasRunPlan: (graph) => ({ includedNodeIds: graph.nodes.map((node) => node.id), blockers: [], steps: graph.nodes.map((node) => ({ nodeId: node.id, action: "execute" })) }),
};
let iterationResult;
let resets = 0;
const iteration = {
  executeCanvasIteration: async (context) => { await context.saveMetadata(iterationResult.internalMetadata.iteration); return clone(iterationResult); },
  resetCanvasIterationFailures: async () => { resets += 1; return 1; },
};
const registry = {
  getCanvasNodeDefinition: (type) => ({ type, label: type, inputs: type === "utility.image-iterate" ? [{ id: "images", required: true }] : type === "sink" ? [{ id: "text", required: true }] : [], outputs: [], capability: type === "publish.feishu" ? "external_write" : undefined }),
  getCanvasNodeExecutionMode: () => "enabled", normalizeUrlList: () => [],
};
const runtime = load("src/lib/canvas/runs.ts", {
  "../database": database, "../activity-log": {},
  "../workspace-ownership": { canAccessWorkspaceOwner: (account, owner) => account.id === owner },
  "../concurrency": { concurrencyConfig: { canvasRun: 0 } },
  "../image-transport": { isImageNetworkUnavailableError: () => false },
  "./executors": { CanvasNeedsConfigError: class extends Error {}, executeCanvasNode: async ({ node, inputs }) => {
    calls.push({ nodeId: node.id, inputs });
    return node.type === "input.images" ? { outputs: { images: { kind: "images", items: [{ url: "/media/1.jpg" }] } } } : { outputs: { text: { kind: "text", value: "downstream" } } };
  } },
  "./seedance": {}, "./graph": graphModule, "./registry": registry, "./workflows": {}, "./iteration-runtime": iteration,
}, "\nexport { executeCanvasRun as executeForTest, finishCancelledRun as cancelForTest };\n");
const graph = { nodes: [{ id: "source", type: "input.images", config: {} }, { id: "region", type: "utility.image-iterate", config: {} }, { id: "sink", type: "sink", config: {} }], edges: [{ source: "source", sourcePort: "images", target: "region", targetPort: "images" }, { source: "region", sourcePort: "text", target: "sink", targetPort: "text" }] };
const account = { id: "owner", displayName: "Owner", role: "operator" };
const run = { id: "parent", ownerUserId: "owner", ownerDisplayName: "Owner", workflowId: "workflow", workflowRevision: 1, graphSnapshot: graph, status: "queued", confirmation: {} };
records.set(run.id, clone(run));
iterationResult = { pending: true, outputs: {}, internalMetadata: { iteration: { schemaVersion: 1, inputFingerprint: "a", revision: 0, items: [] } } };
let result = await runtime.executeForTest(clone(run));
assert.equal(result.status, "running");
assert.equal(result.iterationWaiting, true);
assert.deepEqual(calls.map((call) => call.nodeId), ["source"], "pending region cannot invoke downstream");
iterationResult = { outputs: { text: { kind: "text", value: "five analyses" } }, internalMetadata: { iteration: { schemaVersion: 1, inputFingerprint: "a", revision: 1, deliveredRevision: 1, items: [] } } };
result = await runtime.executeForTest(result);
assert.equal(result.status, "completed");
assert.equal(calls[1].inputs.text[0].value, "five analyses");
assert.equal(latest(run.id).filter((attempt) => attempt.nodeId === "region").length, 1, "pending region resumes same attempt");

database.requeueCanvasRunQueueItem = async () => true;
await runtime.retryCanvasNode(run.id, "region", account);
result = records.get(run.id);
assert.deepEqual(result.retryNodeIds, ["region"]);
assert.equal(result.iterationRepairing, true);
iterationResult.internalMetadata.iteration.downstreamStale = true;
iterationResult.internalMetadata.iteration.revision = 2;
iterationResult.outputs.text.value = "repaired";
result = await runtime.executeForTest(result);
assert.equal(calls.length, 2, "repair does not reexecute delivered downstream");
assert.equal(resets, 1);
await assert.rejects(runtime.retryCanvasNode(run.id, "region", { id: "other" }), /not found/);

const child = { ...run, id: "child", iterationContext: { parentRunId: run.id, regionNodeId: "region", itemId: "item", index: 0 }, graphSnapshot: { nodes: [{ id: "entry", type: "input.iteration-item", config: {} }], edges: [] }, iterationInputs: { images: { kind: "images", items: [{ url: "/media/child.jpg" }] } } };
records.set(child.id, clone(child));
result = await runtime.executeForTest(child);
assert.equal(result.status, "completed");
assert.equal(latest(child.id)[0].outputs.images.items[0].url, "/media/child.jpg");
await assert.rejects(runtime.retryCanvasNode(child.id, "entry", account), /owning|region/);
records.set(run.id, { ...records.get(run.id), status: "cancelled" });
result = await runtime.executeForTest(child);
assert.equal(result.status, "cancelled");
const cancelMetadata = { schemaVersion: 1, items: [{ id: "item", runId: "child" }], revision: 1 };
const priorRegion = { id: "prior-region", nodeId: "region", attempt: 3, status: "running", inputs: { images: [] }, outputs: {}, internalMetadata: { iteration: cancelMetadata } };
await runtime.cancelForTest({ ...run, id: "cancel-region" }, new Set(["region"]), new Map([["region", priorRegion]]));
const cancelledAttempt = latest("cancel-region")[0];
assert.deepEqual(cancelledAttempt.internalMetadata.iteration, cancelMetadata, "cancellation preserves region item identities for details and retry");
assert.equal(cancelledAttempt.attempt, 4);

console.log("Canvas iteration runs: durable yield/resume, isolated entry, repair boundary and owner/cancel checks passed.");
