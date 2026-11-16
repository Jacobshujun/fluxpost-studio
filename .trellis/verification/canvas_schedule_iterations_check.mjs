import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const compile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loaded = { exports: {} };
new Function("module", "exports", compile(readFileSync("src/lib/canvas/iteration-summary.ts", "utf8")))(loaded, loaded.exports);
const { canvasScheduleIterationSummary, requireFailedIterationNode } = loaded.exports;
const graph = { nodes: [{ id: "region", label: "内页处理", config: { failurePolicy: "all" } }, { id: "cover", label: "首图", config: { failurePolicy: "at-least-one" } }] };
const metadata = { items: [
  { id: "i1", index: 0, status: "completed", runId: "image-1", source: { url: "/1.png" }, outputs: { images: { kind: "images", items: [{ url: "/output.png" }] } } },
  { id: "i2", index: 1, status: "partial", error: "Upstream HTTP 503", runId: "image-2", source: { url: "/2.png" } },
] };
const attempts = [
  { nodeId: "region", attempt: 1, internalMetadata: { iteration: { items: [{ index: 10, status: "failed" }] } } },
  { nodeId: "region", attempt: 2, internalMetadata: { iteration: metadata } },
  { nodeId: "cover", attempt: 1, internalMetadata: { iteration: { items: [{ index: 0, status: "completed" }] } } },
];
const summary = canvasScheduleIterationSummary(graph, attempts);
assert.equal(summary.length, 2);
assert.deepEqual(summary[0], { nodeId: "region", label: "内页处理", policy: "all", total: 2, completed: 1, failed: 1, pending: 0, failures: [{ index: 2, error: "Upstream HTTP 503" }] });
assert.equal(summary[1].policy, "at-least-one");
assert.ok(!JSON.stringify(summary).includes("/output.png"), "Compact summaries must not duplicate output media");
assert.equal(requireFailedIterationNode(graph, attempts, "region"), "region");
assert.throws(() => requireFailedIterationNode(graph, attempts, "missing"), /no finished failed/);
assert.throws(() => requireFailedIterationNode(graph, attempts, "cover"), /no finished failed/);
const pendingAttempts = structuredClone(attempts);
pendingAttempts[1].internalMetadata.iteration.items[0].status = "running";
assert.throws(() => requireFailedIterationNode(graph, pendingAttempts, "region"), /no finished failed/);
const fifty = Array.from({ length: 50 }, (_, index) => ({ main: `main-${index}`, summaries: canvasScheduleIterationSummary(graph, attempts) }));
assert.equal(fifty[49].summaries[0].failures[0].index, 2);
assert.ok(JSON.stringify(fifty).length < 30000, "50 summaries must stay compact");

const scheduler = readFileSync("src/lib/canvas/scheduler.ts", "utf8");
const detailsCode = scheduler.slice(scheduler.indexOf("export async function getCanvasScheduleIterationDetails"), scheduler.indexOf("export async function createCanvasSchedule"));
const account = { id: "owner" };
const schedule = { id: "schedule", ownerUserId: "owner", mainTasks: [{ id: "main", sharedRunId: "shared", childTasks: [{ id: "child", runId: "run" }] }] };
const run = { id: "run", ownerUserId: "owner", status: "failed", graphSnapshot: graph, batchContext: { schemaVersion: 2, scheduleId: "schedule", mainTaskId: "main", childTaskId: "child", phase: "child" } };
const imageRecords = new Map([
  ["image-1", { id: "image-1", ownerUserId: "owner", status: "completed", iterationContext: { parentRunId: "run", regionNodeId: "region", itemId: "i1" } }],
  ["image-2", { id: "image-2", ownerUserId: "owner", status: "partial", error: "Upstream HTTP 503", iterationContext: { parentRunId: "run", regionNodeId: "region", itemId: "i2" }, graphSnapshot: { nodes: [{ id: "generate", label: "内页生图", type: "model.gpt-image", version: 2 }] } }],
]);
let childReads = 0;
const detailsModule = { exports: {} };
const dependencies = {
  requireSchedule: async (_id, actor) => { if (actor.id !== "owner") throw new Error("Canvas schedule not found"); return schedule; },
  isCanvasScheduleV2: () => true,
  getCanvasRun: async (id, actor) => id === "run" && actor.id === "owner" ? { run, nodeRuns: attempts.slice(0, 2) } : undefined,
  latestNodeAttempts: (rows) => { const by = new Map(); for (const row of rows) if (!by.has(row.nodeId) || row.attempt > by.get(row.nodeId).attempt) by.set(row.nodeId, row); return by; },
  canvasScheduleIterationSummary,
  getCanvasRunFromDb: async (id) => { childReads++; return imageRecords.get(id); },
  listCanvasNodeRunsFromDb: async (id) => { assert.equal(id, "image-2", "Successful image node history need not be loaded"); return [{ nodeId: "generate", status: "failed" }]; },
  findFailedCanvasNode: (_run, rows) => rows.find((row) => row.status === "failed"),
  getCanvasNodeDefinition: () => ({ label: "GPT 图片" }),
};
new Function(...Object.keys(dependencies), "module", "exports", compile(detailsCode))(...Object.values(dependencies), detailsModule, detailsModule.exports);
const getDetails = detailsModule.exports.getCanvasScheduleIterationDetails;
const details = await getDetails("schedule", account, { mainTaskId: "main", childTaskId: "child", phase: "child" });
assert.equal(details.regions[0].items[1].failedNodeLabel, "内页生图");
assert.equal(details.regions[0].items[1].index, 2);
assert.equal(details.regions[0].items[0].status, "completed");
assert.equal(childReads, 2, "Details load only this result's images");
imageRecords.get("image-2").status = "completed";
imageRecords.get("image-2").error = undefined;
const refreshedDetails = await getDetails("schedule", account, { mainTaskId: "main", childTaskId: "child", phase: "child" });
assert.equal(refreshedDetails.regions[0].failed, 0);
assert.equal(refreshedDetails.regions[0].items[1].error, undefined, "Live completed items must not inherit an old parent-metadata error");
imageRecords.get("image-2").status = "partial";
imageRecords.get("image-2").error = "Upstream HTTP 503";
await assert.rejects(getDetails("schedule", { id: "other" }, { mainTaskId: "main", childTaskId: "child", phase: "child" }), /not found/);
await assert.rejects(getDetails("schedule", account, { mainTaskId: "other", childTaskId: "child", phase: "child" }), /not found/);
run.batchContext.childTaskId = "wrong";
await assert.rejects(getDetails("schedule", account, { mainTaskId: "main", childTaskId: "child", phase: "child" }), /identity mismatch/);
run.batchContext.childTaskId = "child";
imageRecords.get("image-2").ownerUserId = "other";
await assert.rejects(getDetails("schedule", account, { mainTaskId: "main", childTaskId: "child", phase: "child" }), /identity mismatch/);
imageRecords.get("image-2").ownerUserId = "owner";
imageRecords.get("image-2").iterationContext.itemId = "wrong";
await assert.rejects(getDetails("schedule", account, { mainTaskId: "main", childTaskId: "child", phase: "child" }), /identity mismatch/);
const route = readFileSync("src/app/api/canvas/schedules/[id]/iterations/route.ts", "utf8");
assert.match(route, /requireWorkspaceAccount\(request\)/);
assert.match(route, /phase === "child" && !childTaskId/);
console.log("Batch iteration diagnostics: latest attempts, compact 50-group summaries, exact image/node errors, lazy scope reads and schedule/run/image identity guards passed.");
