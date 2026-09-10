import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const graph = { nodes: [{ id: "source", type: "input.images" }, { id: "region", type: "utility.image-iterate" }, { id: "compose", type: "compose.social-post" }, { id: "publish", type: "publish.feishu" }], edges: [{ source: "region", target: "compose" }, { source: "compose", target: "publish" }] };
let run = { id: "run", ownerUserId: "owner", status: "completed", graphSnapshot: graph };
const metadata = { items: [{ id: "item", runId: "child", index: 0, status: "completed" }], downstreamStale: true, revision: 2, deliveredRevision: 1 };
let nodeRuns = [{ nodeId: "region", internalMetadata: { iteration: metadata } }];
let published = false;
let retries = 0;
let saved;
const modules = {
  "../database": { getCanvasRunFromDb: async () => ({ ownerUserId: "owner", status: "completed", iterationContext: { parentRunId: "run", regionNodeId: "region" } }), listCanvasNodeRunsFromDb: async () => [], saveCanvasRunToDb: async (value) => { saved = value; return value; }, requeueCanvasRunQueueItem: async () => true },
  "../generated-posts": { getGeneratedPost: async () => ({ status: published ? "published" : "draft" }) },
  "./graph": {
    buildCanvasRunPlan: () => ({ blockers: [], includedNodeIds: graph.nodes.map((node) => node.id), steps: [] }),
    collectDescendants: (_graph, ids) => ids.includes("publish") ? new Set(["publish"]) : new Set(["region", "compose", "publish"]),
  },
  "./iteration-runtime": { latestAttempts: (attempts) => new Map(attempts.map((attempt) => [attempt.nodeId, attempt])) },
  "./registry": { getCanvasNodeDefinition: (type) => ({ capability: type === "publish.feishu" ? "external_write" : undefined }) },
  "./runs": { getCanvasRun: async (_id, account) => account.id === "owner" ? { run, nodeRuns } : undefined, retryCanvasNode: async () => { retries += 1; }, ensureCanvasRunWorker: () => {} },
  "./scheduler": { refreshCanvasScheduleIterationResult: async () => {} },
};
const compiled = ts.transpileModule(readFileSync("src/lib/canvas/iteration-actions.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loaded = { exports: {} };
new Function("require", "module", "exports", compiled)((name) => { if (name in modules) return modules[name]; throw new Error(name); }, loaded, loaded.exports);
const { getCanvasIterationDetails, updateCanvasIteration } = loaded.exports;
const account = { id: "owner" };
assert.equal((await getCanvasIterationDetails("run", "region", account)).items.length, 1);
await assert.rejects(getCanvasIterationDetails("run", "region", { id: "other" }), /not found/);
await updateCanvasIteration("run", "region", "retry-failed", account);
assert.equal(retries, 1);
await updateCanvasIteration("run", "region", "refresh-downstream", account);
assert.deepEqual(saved.retryNodeIds, ["compose"]);
assert.deepEqual(saved.targetNodeIds, ["source", "region", "compose"], "explicit refresh excludes publishing and its descendants");
assert.deepEqual(saved.iterationRefreshRegionIds, ["region"]);
run = { ...run, status: "running" };
await assert.rejects(updateCanvasIteration("run", "region", "refresh-downstream", account), /Wait/);
run = { ...run, status: "completed", batchContext: { schemaVersion: 2, phase: "shared" } };
await assert.rejects(updateCanvasIteration("run", "region", "refresh-downstream", account), /frozen/);
delete run.batchContext;
published = true;
nodeRuns = [...nodeRuns, { nodeId: "compose", outputs: { post: { kind: "socialPost", postId: "post" } } }];
await assert.rejects(updateCanvasIteration("run", "region", "refresh-downstream", account), /Published/);
await assert.rejects(updateCanvasIteration("run", "region", "invalid", account), /Unsupported/);
console.log("Canvas iteration actions: owner checks, explicit refresh, published/shared guards and publish exclusion passed.");

const schedulerSource = readFileSync("src/lib/canvas/scheduler.ts", "utf8");
const schedulerAst = ts.createSourceFile("scheduler.ts", schedulerSource, ts.ScriptTarget.Latest, true);
const refreshDeclaration = schedulerAst.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "refreshCanvasScheduleIterationResult");
const refreshCode = ts.transpileModule(refreshDeclaration.getText(schedulerAst).replace(/^export /, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
let schedule = { id: "schedule", schemaVersion: 2, status: "completed", revision: 1, definition: { childResult: { nodeId: "region", outputPort: "text", artifactKind: "text" }, mainTargetNodeId: "compose" }, workflowSnapshot: graph, mainTasks: [{ id: "main", generatedPostId: "post", mainRunId: "old-aggregate", resultArtifacts: [{ kind: "socialPost" }], childTasks: [{ id: "child", runId: "run", status: "completed", resultArtifacts: [] }] }] };
let publishTarget = false;
const scheduledNode = { nodeId: "region", internalMetadata: { iteration: metadata }, outputs: { text: { kind: "text", value: "repaired" } } };
const refreshSchedule = Function("requireSchedule", "isCanvasScheduleV2", "getGeneratedPost", "buildCanvasRunPlan", "listCanvasNodeRunsFromDb", "latestNodeAttempts", "extractCanvasScheduleV2Artifacts", "summarizeCanvasScheduleArtifacts", "saveUpdatedSchedule", "saveCanvasNodeRunToDb", "saveCanvasRunToDb", "kickCanvasSchedulerWorker", `${refreshCode}\nreturn refreshCanvasScheduleIterationResult;`)(
  async () => schedule, () => true, async () => ({ status: published ? "published" : "draft" }),
  () => ({ capabilities: publishTarget ? ["external_write"] : [] }), async () => [scheduledNode],
  (attempts) => new Map(attempts.map((attempt) => [attempt.nodeId, attempt])),
  (outputs, port) => [outputs[port]], () => ({ produced: 1, failed: 0 }),
  async (value) => { schedule = value; }, async () => {}, async (value) => value, () => {},
);
const scheduledRun = { ...run, batchContext: { schemaVersion: 2, phase: "child", scheduleId: "schedule", mainTaskId: "main", childTaskId: "child" }, iterationRepairing: true };
await assert.rejects(refreshSchedule(scheduledRun, "region", account), /Published/);
published = false;
publishTarget = true;
await assert.rejects(refreshSchedule(scheduledRun, "region", account), /publishing/);
publishTarget = false;
const refreshed = await refreshSchedule(scheduledRun, "region", account);
assert.equal(refreshed.iterationRepairing, false);
assert.equal(schedule.mainTasks[0].mainRunId, undefined);
assert.equal(schedule.mainTasks[0].generatedPostId, undefined, "manual refresh creates a new aggregate instead of overwriting an existing post");
assert.equal(schedule.mainTasks[0].childTasks[0].resultArtifacts[0].value, "repaired");
assert.equal(schedule.mainTasks[0].childTasks[0].iterationDeliveredRevisions.region, 2);
const appliedRevision = schedule.revision;
await refreshSchedule(scheduledRun, "region", account);
assert.equal(schedule.revision, appliedRevision, "replay after schedule save cannot create a second aggregate");
scheduledNode.internalMetadata.iteration.downstreamStale = false;
await refreshSchedule(scheduledRun, "region", account);
assert.equal(schedule.revision, appliedRevision, "replay after metadata clearing is also idempotent");
schedule.status = "cancelled";
await assert.rejects(refreshSchedule(scheduledRun, "region", account, true), /Cancelled/);
schedule.status = "paused";
await assert.rejects(refreshSchedule(scheduledRun, "region", account, true), /Resume/);
console.log("Canvas iteration schedule refresh: explicit aggregate replacement, published and publishing guards passed.");
