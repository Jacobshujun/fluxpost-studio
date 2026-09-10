import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";

const require = createRequire(import.meta.url);
const records = new Map();
const attempts = new Map();
const queued = new Set();
const held = new Set();
const clone = (value) => value === undefined ? value : structuredClone(value);
const database = {
  getCanvasRunFromDb: async (id) => clone(records.get(id)),
  saveCanvasRunToDb: async (run) => { records.set(run.id, clone(run)); return clone(run); },
  enqueueCanvasRunQueueItem: async (run) => { queued.add(run.id); },
  wakeCanvasIterationRun: async (id) => { queued.add(id); held.delete(id); },
  holdCanvasIterationItemQueue: async (id) => { held.add(id); queued.delete(id); },
  listCanvasNodeRunsFromDb: async (id) => clone(attempts.get(id) || []),
};
const graph = {
  buildCanvasRunPlan: () => ({ blockers: [], steps: [] }),
  collectDescendants: (_graph, ids) => new Set([...ids, "generate"]),
};
const source = readFileSync("src/lib/canvas/iteration-runtime.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loaded = { exports: {} };
new Function("require", "module", "exports", compiled)((name) => {
  if (name === "../database") return database;
  if (name === "./graph") return graph;
  if (name.startsWith("node:")) return require(name);
  throw new Error(`Unexpected import ${name}`);
}, loaded, loaded.exports);
const { executeCanvasIteration, resetCanvasIterationFailures } = loaded.exports;

function fixture(id, failurePolicy = "all", count = 5) {
  const run = { id, workflowId: "workflow", workflowRevision: 1, ownerUserId: "owner", ownerDisplayName: "Owner", status: "running", confirmation: { nodeIds: [], capabilities: [] } };
  records.set(id, run);
  const node = { id: "region", type: "utility.image-iterate", config: { concurrency: 2, failurePolicy }, iteration: {
    graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
    outputs: { text: { nodeId: "vision", outputPort: "text" }, images: { nodeId: "generate", outputPort: "images" } },
  } };
  const inputs = { images: [{ kind: "images", items: Array.from({ length: count }, (_, index) => ({ url: `/media/${index % 2}.jpg` })) }], text: [{ kind: "text", value: "shared" }], references: [{ kind: "images", items: [{ url: "/media/ref.jpg" }] }] };
  const context = { run, node, inputs, previousNodeRun: undefined, saveMetadata: async (metadata) => { context.metadata = clone(metadata); } };
  return context;
}

async function advance(context) {
  const result = await executeCanvasIteration(context);
  context.previousNodeRun = { nodeId: "region", outputs: result.outputs, internalMetadata: clone(result.internalMetadata) };
  return result;
}

function finish(item, failed = false) {
  const child = records.get(item.runId);
  assert.ok(child);
  records.set(item.runId, { ...child, status: failed ? "partial" : "completed", error: failed ? "provider failure" : undefined });
  queued.delete(item.runId);
  attempts.set(item.runId, [
    { nodeId: "vision", attempt: 1, status: "completed", outputs: { text: { kind: "text", value: `analysis-${item.index}` } } },
    { nodeId: "generate", attempt: 1, status: failed ? "failed" : "completed", outputs: failed ? {} : { images: { kind: "images", items: [{ url: `/generated/${item.index}.jpg` }, { url: `/generated/${item.index}-b.jpg` }] } } },
  ]);
}

const context = fixture("parent");
let result = await advance(context);
assert.equal(result.pending, true);
assert.equal(queued.size, 2, "concurrency admits only two images");
const items = context.metadata.items;
assert.equal(new Set(items.map((item) => item.id)).size, 5, "duplicate source URLs stay separate");
assert.deepEqual(records.get(items[0].runId).iterationInputs, {
  images: { kind: "images", items: [items[0].source] }, index: { kind: "text", value: "1" },
  text: { kind: "text", value: "shared" }, references: { kind: "images", items: [{ url: "/media/ref.jpg" }] },
});
await advance(context);
assert.equal(queued.size, 2, "repeated parent reconciliation cannot exceed concurrency");
finish(items[1]);
await advance(context);
assert.equal(queued.size, 2);
finish(items[0]); finish(items[2]);
await advance(context);
finish(items[4]); finish(items[3], true);
result = await advance(context);
assert.match(result.failure, /4\/5/);
assert.deepEqual(result.outputs, {});
assert.equal(await resetCanvasIterationFailures(context.run, context.previousNodeRun), 1);
assert.deepEqual(records.get(items[3].runId).retryNodeIds, ["generate"], "successful analysis is reused");
result = await advance(context);
assert.equal(queued.size, 1);
finish(items[3]);
result = await advance(context);
assert.equal(result.failure, undefined);
assert.equal(result.outputs.images.items.length, 10);
assert.equal(result.outputs.images.items[6].url, "/generated/3.jpg");
assert.match(result.outputs.text.value, /\[Image 1\][\s\S]*\[Image 5\]/);
assert.equal(result.internalMetadata.iteration.downstreamStale, undefined);
const revision = result.internalMetadata.iteration.revision;
assert.equal((await advance(context)).internalMetadata.iteration.revision, revision, "reconciliation is idempotent");

const partial = fixture("partial", "at-least-one", 2);
await advance(partial);
finish(partial.metadata.items[0]); finish(partial.metadata.items[1], true);
result = await advance(partial);
assert.equal(result.outputs.images.items.length, 2);
assert.equal(result.partial, undefined, "accepted partial items do not override schedule policy");
await resetCanvasIterationFailures(partial.run, partial.previousNodeRun);
await advance(partial);
finish(partial.metadata.items[1]);
result = await advance(partial);
assert.equal(result.internalMetadata.iteration.downstreamStale, true);
assert.equal(result.internalMetadata.iteration.deliveredRevision, 1);
assert.equal(result.internalMetadata.iteration.revision, 2);

const allFailed = fixture("all-failed", "at-least-one", 1);
await advance(allFailed); finish(allFailed.metadata.items[0], true);
assert.match((await advance(allFailed)).failure, /0\/1/);
await assert.rejects(advance(fixture("empty", "all", 0)), /1 to 18/);
await assert.rejects(advance(fixture("excess", "all", 19)), /1 to 18/);
const changed = { ...context, inputs: { ...context.inputs, text: [{ kind: "text", value: "changed" }] } };
await assert.rejects(executeCanvasIteration(changed), /inputs changed/);
const stolen = records.get(items[0].runId);
records.set(stolen.id, { ...stolen, ownerUserId: "other" });
await assert.rejects(executeCanvasIteration(context), /identity mismatch/);
records.set(stolen.id, stolen);
const frozen = { ...context, node: { ...context.node, frozenOutputs: result.outputs }, inputs: {} };
assert.deepEqual((await executeCanvasIteration(frozen)).outputs, result.outputs);
const other = fixture("other-parent", "all", 1);
await advance(other);
assert.notEqual(other.metadata.items[0].runId, items[0].runId, "same node and image in another task never shares item identity");
const max = fixture("maximum", "all", 18);
max.node.config.concurrency = 20;
await advance(max);
assert.equal(max.metadata.items.length, 18);
assert.equal(max.metadata.items.filter((item) => records.has(item.runId)).length, 18);
const beforeAdmission = fixture("cancel-before-admission", "all", 3);
records.get(beforeAdmission.run.id).cancelRequestedAt = "now";
await advance(beforeAdmission);
assert.equal(beforeAdmission.metadata.items.filter((item) => records.has(item.runId)).length, 0);
assert.equal(await resetCanvasIterationFailures(beforeAdmission.run, beforeAdmission.previousNodeRun), 3, "cancelled-before-admission items can resume without fabricated child records");
records.get(beforeAdmission.run.id).cancelRequestedAt = undefined;
await advance(beforeAdmission);
assert.equal(beforeAdmission.metadata.items.filter((item) => records.has(item.runId)).length, 2);
const runsSource = readFileSync("src/lib/canvas/runs.ts", "utf8");
assert.match(runsSource, /parkCanvasIterationRun\(queueItem.id, workerId\)/);
assert.match(readFileSync("src/lib/database.ts", "utf8"), /wakeCanvasIterationParentSqlite/);
assert.match(runsSource, /if \(run.iterationContext\) return undefined/);
console.log("Canvas iteration runtime: ordering, identity, concurrency, retry, partial delivery and frozen output checks passed.");
