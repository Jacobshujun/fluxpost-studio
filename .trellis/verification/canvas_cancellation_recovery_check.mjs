import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { assertDeadWorker, assertLocalDatabase, parseArgs, planRecovery, recover } from "../../scripts/local/recover-canvas-cancellation.mjs";

const now = "2026-10-19T04:00:00.000Z";
const options = { scheduleIds: ["schedule-a"], interruptedRunIds: [], apply: false };
function row(id, status, data = {}, columns = {}) {
  return { id, status, data_json: { id, status, ...data }, ...columns };
}
function fixture() {
  return {
    schedules: [row("schedule-a", "running", {
      revision: 1,
      mainTasks: [
        { id: "done", status: "completed", resultArtifacts: [{ kind: "images", items: [{ url: "secret-fixture" }] }], childTasks: [] },
        { id: "pending", status: "running", sharedStatus: "completed", sharedArtifacts: ["keep"], childTasks: [{ status: "pending" }, { status: "failed" }, { status: "partial" }] },
      ], batches: [{ status: "running", contentTasks: [{ status: "running", imageTasks: [{ status: "queued" }, { status: "completed" }] }] }],
    }, { revision: 1 })],
    runs: [
      row("run-a", "running", { cancelRequestedAt: "existing", batchContext: { scheduleId: "schedule-a" } }),
      row("done-run", "completed", { batchContext: { scheduleId: "schedule-a" } }),
      row("child-run", "queued", { iterationContext: { parentRunId: "run-a" } }),
      row("unrelated", "running", { batchContext: { scheduleId: "other" } }),
    ],
    nodes: [row("active-node", "running", {}, { run_id: "run-a", node_id: "image", node_type: "utility.image-process", attempt: 1 }), row("successful-node", "completed", { outputs: { images: "preserve" } }, { run_id: "run-a", node_id: "model", node_type: "model.image", attempt: 1 })],
    queues: [row("queue-a", "running", { lockedBy: "canvas-worker-99999-1-1", attempts: 1 }, { run_id: "run-a", locked_by: "canvas-worker-99999-1-1", attempts: 1 })],
  };
}

assert.deepEqual(parseArgs(["--schedule-id", "a", "--schedule-id", "a"]), { scheduleIds: ["a"], interruptedRunIds: [], apply: false });
assert.throws(() => parseArgs([]));
assert.throws(() => parseArgs(["--apply"]));
assert.throws(() => parseArgs(["--schedule-id", "a' OR true"]));
for (const url of ["postgres://u:p@127.0.0.1/db", "postgresql://localhost/db", "postgres://[::1]/db"]) assertLocalDatabase(url);
for (const url of [undefined, "postgres://production/db", "postgres://localhost/db?host=production", "postgres://localhost/db?hostaddr=10.0.0.1"]) assert.throws(() => assertLocalDatabase(url));
assertDeadWorker("canvas-worker-99999-1-1", () => false);
assert.throws(() => assertDeadWorker("canvas-worker-99999-1-1", () => true));
assert.throws(() => assertDeadWorker("unrecognized", () => false));
assert.throws(() => assertDeadWorker("canvas-worker-99999-1-1", () => { throw new Error("ambiguous"); }));

const source = fixture();
const before = structuredClone(source);
const plan = planRecovery(source, options, { now });
assert.deepEqual(source, before, "planning must not modify snapshots");
assert.deepEqual(plan.runs.map((item) => item.id), ["run-a", "child-run"]);
assert.deepEqual(plan.nodes.map((item) => item.id), ["active-node"]);
assert.equal(plan.queues[0].locked_by, null);
assert.equal(plan.queues[0].data_json.lockedBy, undefined);
assert.equal(plan.runs[0].data_json.cancelRequestedAt, "existing");
assert.equal(plan.schedules[0].revision, 2);
const main = plan.schedules[0].data_json.mainTasks;
assert.deepEqual(main[0], before.schedules[0].data_json.mainTasks[0], "completed results must remain byte equivalent");
assert.equal(main[1].status, "cancelled");
assert.equal(main[1].sharedStatus, "completed");
assert.deepEqual(main[1].childTasks.map((item) => item.status), ["cancelled", "failed", "partial"]);
assert.deepEqual(plan.schedules[0].data_json.batches[0].contentTasks[0].imageTasks.map((item) => item.status), ["cancelled", "completed"]);
const noIntent = fixture();
delete noIntent.runs[0].data_json.cancelRequestedAt;
assert.throws(() => planRecovery(noIntent, options), /No existing cancellation intent/);

const resumeOptions = { scheduleIds: [], interruptedRunIds: ["run-a"], apply: false };
const resumed = planRecovery(noIntent, resumeOptions, { now, isAlive: () => false });
assert.deepEqual(resumed.schedules, []);
assert.deepEqual(resumed.nodes, [], "resuming must preserve all existing node attempts");
assert.equal(resumed.runs[0].status, "queued");
assert.equal(resumed.queues[0].attempts, 0);
assert.equal(resumed.queues[0].data_json.attempts, 0);
assert.equal(resumed.queues[0].locked_until, null);
assert.equal(resumed.queues[0].data_json.completedAt, undefined);
assert.throws(() => planRecovery(noIntent, resumeOptions, { isAlive: () => true }), /still alive/);
const unsafeType = structuredClone(noIntent);
unsafeType.nodes[0].node_type = "model.image";
assert.throws(() => planRecovery(unsafeType, resumeOptions, { isAlive: () => false }), /Only interrupted image-processing/);
const unsafeRetry = structuredClone(noIntent);
unsafeRetry.runs[0].data_json.retryNodeIds = ["model"];
assert.throws(() => planRecovery(unsafeRetry, resumeOptions, { isAlive: () => false }), /replay a successful/);
const failedModel = structuredClone(noIntent);
failedModel.nodes.push(row("failed-model", "failed", {}, { run_id: "run-a", node_id: "model-other", node_type: "model.image", attempt: 1 }));
assert.throws(() => planRecovery(failedModel, resumeOptions, { isAlive: () => false }), /Only interrupted image-processing/, "resumption must not retry another failed provider node");
const cancelledResume = planRecovery(source, resumeOptions, { now, isAlive: () => false });
assert.equal(cancelledResume.runs[0].status, "cancelled", "an existing cancel intent must never resume");
assert.equal(cancelledResume.queues[0].status, "cancelled");

function fakeClient(snapshot, events, failUpdate = false) {
  return { query: async (sql) => {
    events.push(sql);
    if (sql.startsWith("UPDATE") && failUpdate) throw new Error("fixture update failed");
    if (sql.startsWith("SELECT * FROM canvas_schedules")) return { rows: snapshot.schedules };
    if (sql.startsWith("WITH RECURSIVE") || sql.startsWith("SELECT * FROM canvas_runs")) return { rows: snapshot.runs };
    if (sql.startsWith("SELECT * FROM canvas_node_runs")) return { rows: snapshot.nodes };
    if (sql.startsWith("SELECT * FROM canvas_run_queue")) return { rows: snapshot.queues };
    return { rows: [] };
  } };
}
const dryEvents = [];
const dry = await recover(fakeClient(source, dryEvents), options, { backup: async () => { throw new Error("dry-run must not create backups"); } });
assert.equal(dry.mode, "dry-run");
assert.equal(dryEvents[0], "BEGIN");
assert.equal(dryEvents.at(-1), "ROLLBACK");
assert.equal(dryEvents.some((sql) => sql.startsWith("UPDATE")), false);
assert.equal(JSON.stringify(dry).includes("secret-fixture"), false);
const applyEvents = [];
const applied = await recover(fakeClient(source, applyEvents), { ...options, apply: true }, { backup: async (snapshot, changes) => {
  assert.deepEqual(snapshot, source);
  assert.equal(changes.nodes.length, 1);
  applyEvents.push("BACKUP");
  return "data/reports/fixture.json";
} });
assert.equal(applied.backupPath, "data/reports/fixture.json");
assert.ok(applyEvents.indexOf("BACKUP") < applyEvents.findIndex((sql) => sql.startsWith("UPDATE")));
assert.equal(applyEvents.at(-1), "COMMIT");
const failedBackupEvents = [];
await assert.rejects(recover(fakeClient(source, failedBackupEvents), { ...options, apply: true }, { backup: async () => { throw new Error("fixture disk full"); } }), /disk full/);
assert.equal(failedBackupEvents.some((sql) => sql.startsWith("UPDATE")), false);
assert.equal(failedBackupEvents.at(-1), "ROLLBACK");
const failedWriteEvents = [];
await assert.rejects(recover(fakeClient(source, failedWriteEvents, true), { ...options, apply: true }, { backup: async () => "fixture" }), /update failed/);
assert.equal(failedWriteEvents.at(-1), "ROLLBACK");
const originalCwd = process.cwd();
const backupFixture = await mkdtemp(path.join(tmpdir(), "fluxpost-canvas-recovery-"));
try {
  process.chdir(backupFixture);
  const backedUp = await recover(fakeClient(source, []), { ...options, apply: true });
  assert.ok(backedUp.backupPath.startsWith("data/reports/canvas-cancellation-recovery-"));
  const snapshot = JSON.parse(await readFile(backedUp.backupPath, "utf8"));
  assert.deepEqual(snapshot.before.runs.map((item) => item.id), ["run-a", "child-run"]);
  assert.deepEqual(snapshot.before.nodes, [source.nodes[0]], "backup must contain exact original touched node rows");
  assert.deepEqual(snapshot.before.queues, source.queues);
  assert.deepEqual(snapshot.before.schedules, source.schedules);
  if (process.platform !== "win32") assert.equal((await stat(backedUp.backupPath)).mode & 0o777, 0o600);
} finally {
  process.chdir(originalCwd);
  await rm(backupFixture, { recursive: true, force: true });
}
console.log("Canvas scoped cancellation recovery checks passed (offline fixtures; no runtime/provider access).");
