import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

const source = readFileSync("src/lib/database.ts", "utf8");
const ast = ts.createSourceFile("database.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const names = [
  "wakeCanvasIterationRun", "parkCanvasIterationRun", "recoverCanvasIterationRuns", "holdCanvasIterationItemQueue",
  "saveCanvasRunToDb", "getCanvasRunFromDb", "listCanvasRunsFromDb", "listCanvasRunsForWorkflowFromDb",
  "enqueueCanvasRunQueueItem", "canvasRunQueueItem", "claimNextCanvasRunQueueItem", "heartbeatCanvasRunQueueItem",
  "finishCanvasRunQueueItem", "fromCanvasRunQueueRow", "runSqliteTransaction", "normalizeDateValue", "toJson", "fromJson",
  "canvasIterationParentWakePostgresSql", "wakeCanvasIterationParentSqlite", "recoverCanvasIterationTerminalQueues",
];
const declarations = names.map((name) => {
  const declaration = ast.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.ok(declaration, `Missing database function ${name}`);
  return declaration.getText(ast).replace(/^export\s+/, "");
});
const compiled = ts.transpileModule(declarations.join("\n"), { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText;
let clock = Date.parse("2026-09-09T12:00:00.000Z");
class ClockDate extends Date {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
}
const database = new DatabaseSync(":memory:");
database.exec(`
  CREATE TABLE canvas_runs (
    id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, owner_user_id TEXT NOT NULL,
    status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, data_json TEXT NOT NULL
  );
  CREATE TABLE canvas_run_queue (
    id TEXT PRIMARY KEY, run_id TEXT UNIQUE NOT NULL, status TEXT NOT NULL, priority INTEGER NOT NULL,
    attempts INTEGER NOT NULL, max_attempts INTEGER NOT NULL, run_after TEXT NOT NULL,
    locked_by TEXT, locked_until TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    started_at TEXT, completed_at TEXT, error TEXT, data_json TEXT NOT NULL
  );
`);
const postgresCalls = [];
const load = (backend) => Function("ensureDatabaseReady", "getDatabaseBackend", "getSqliteDatabase", "getPostgresPool", "Date",
  `${compiled}\nreturn { ${names.join(", ")} };`)(
  async () => {}, () => backend, () => database,
  () => ({ query: async (sql, values) => { postgresCalls.push({ sql, values }); return { rows: [{ data_json: values?.[6] || "{}" }] }; } }),
  ClockDate,
);
const contract = load("sqlite");
const iso = () => new ClockDate().toISOString();
const reset = () => { database.exec("DELETE FROM canvas_run_queue; DELETE FROM canvas_runs;"); };
const runFixture = (id, extra = {}) => ({
  id, workflowId: "workflow", ownerUserId: "owner", status: "running", createdAt: iso(), updatedAt: iso(),
  graphSnapshot: { nodes: [{ id: "region", type: "utility.image-iterate" }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, ...extra,
});
const childFixture = (id, extra = {}) => runFixture(id, {
  graphSnapshot: { nodes: [{ id: "item", type: "input.iteration-item" }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
  iterationContext: { parentRunId: "parent", regionNodeId: "region", itemId: id, index: 0 }, ...extra,
});
const seed = async (run, queueStatus = "queued", overrides = {}) => {
  await contract.saveCanvasRunToDb(run);
  await contract.enqueueCanvasRunQueueItem(run);
  database.prepare("UPDATE canvas_run_queue SET status = ? WHERE run_id = ?").run(queueStatus, run.id);
  for (const [column, value] of Object.entries(overrides)) {
    assert.ok(["locked_by", "locked_until", "attempts", "completed_at", "error", "data_json"].includes(column));
    database.prepare(`UPDATE canvas_run_queue SET ${column} = ? WHERE run_id = ?`).run(value, run.id);
  }
};
const queue = (runId = "parent") => database.prepare("SELECT * FROM canvas_run_queue WHERE run_id = ?").get(runId);
const claim = (workerId) => contract.claimNextCanvasRunQueueItem(workerId, 10_000);

try {
  await seed(runFixture("parent"));
  const first = await claim("worker-one");
  assert.equal(first.runId, "parent");
  const lease = queue().locked_until;
  await Promise.all([contract.wakeCanvasIterationRun("parent"), contract.wakeCanvasIterationRun("parent")]);
  assert.equal(queue().status, "running");
  assert.equal(queue().locked_by, "worker-one");
  assert.equal(queue().locked_until, lease);
  assert.equal(await claim("worker-two"), undefined, "wake must not release an executing parent's lease");
  await contract.parkCanvasIterationRun(first.id, "worker-one");
  assert.equal(queue().status, "queued", "wake-before-park is retained");
  assert.equal(JSON.parse(queue().data_json).iterationWake, undefined, "park consumes the wake marker atomically");
  const concurrent = await Promise.all([claim("worker-two"), claim("worker-three")]);
  assert.equal(concurrent.filter(Boolean).length, 1, "one parent cannot be claimed concurrently twice");
  const second = concurrent.find(Boolean);
  await contract.parkCanvasIterationRun(first.id, "worker-one");
  assert.equal(queue().locked_by, second.lockedBy, "old worker cannot park a reclaimed parent");
  await contract.parkCanvasIterationRun(second.id, second.lockedBy);
  assert.equal(queue().status, "waiting", "consumed wake does not create an endless self-wake");
  assert.equal(await claim("idle"), undefined);
  await contract.wakeCanvasIterationRun("parent");
  assert.equal(queue().status, "queued", "wake-after-park schedules reconciliation");
  const third = await claim("worker-four");
  await contract.finishCanvasRunQueueItem(third.id, "worker-four", "completed");
  await contract.wakeCanvasIterationRun("parent");
  assert.equal(queue().status, "completed", "late duplicate completion cannot revive a terminal queue");

  reset();
  await seed(runFixture("parent"));
  const cancelling = await claim("cancelling-worker");
  database.prepare("UPDATE canvas_run_queue SET status = 'cancelled' WHERE run_id = 'parent'").run();
  await contract.parkCanvasIterationRun(cancelling.id, "cancelling-worker");
  await contract.finishCanvasRunQueueItem(cancelling.id, "cancelling-worker", "completed");
  await contract.wakeCanvasIterationRun("parent");
  assert.equal(queue().status, "cancelled", "park, finish, and wake preserve a cancelled queue even with an old lock");
  for (const status of ["completed", "failed", "partial", "cancelled"]) {
    reset();
    await seed(runFixture("parent", { status }), "waiting");
    await contract.wakeCanvasIterationRun("parent");
    assert.equal(queue().status, "waiting", `wake cannot resurrect a ${status} run`);
    await contract.recoverCanvasIterationRuns();
    assert.equal(queue().status, "waiting", `recovery cannot resurrect a ${status} run`);
  }

  reset();
  await seed(runFixture("parent"), "waiting", { locked_by: "stale", locked_until: iso(), attempts: 9, completed_at: iso(), error: "old", data_json: '{"iterationWake":true}' });
  await seed(childFixture("completed-child", { status: "completed" }), "completed");
  await contract.recoverCanvasIterationRuns();
  assert.equal(queue().status, "queued", "startup reconciles a waiting parent if child completion crashed before notification");
  assert.equal(queue().locked_by, null);
  assert.equal(queue().locked_until, null);
  assert.equal(queue().attempts, 0);
  assert.equal(queue().completed_at, null);
  assert.equal(queue().error, null);
  assert.equal(JSON.parse(queue().data_json).iterationWake, undefined);
  assert.equal(queue("completed-child").status, "completed");
  const reconciled = await claim("reconciler");
  await contract.parkCanvasIterationRun(reconciled.id, "reconciler");
  assert.equal(queue().status, "waiting", "recovery clears stale wake markers");

  reset();
  const past = new Date(clock - 1).toISOString();
  const future = new Date(clock + 10_000).toISOString();
  await seed(runFixture("expired-parent"), "running", { locked_by: "dead", locked_until: past, attempts: 1 });
  await seed(childFixture("expired-child"), "running", { locked_by: "dead", locked_until: past, attempts: 1 });
  await seed(runFixture("null-lock"), "running", { locked_by: "dead", locked_until: null, attempts: 1 });
  await seed(runFixture("live-parent"), "running", { locked_by: "alive", locked_until: future, attempts: 1 });
  await seed(childFixture("held-child", { status: "queued", iterationAdmissionPending: true }), "waiting");
  await seed(childFixture("held-stale-child", { status: "queued", iterationAdmissionPending: true }), "running", { locked_by: "dead", locked_until: past });
  await seed(childFixture("retry-gap", { status: "failed" }), "waiting");
  await seed(runFixture("ordinary", { graphSnapshot: { nodes: [] } }), "waiting");
  await seed(runFixture("cancel-requested", { cancelRequestedAt: iso() }), "waiting");
  await seed(runFixture("cancelled", { status: "cancelled" }), "running", { locked_by: "dead", locked_until: past });
  await seed(runFixture("cancelled-queue"), "cancelled");
  await contract.recoverCanvasIterationRuns();
  for (const id of ["expired-parent", "expired-child", "null-lock", "cancel-requested"]) assert.equal(queue(id).status, "queued", `${id} should reconcile`);
  for (const id of ["held-child", "retry-gap", "ordinary"]) assert.equal(queue(id).status, "waiting", `${id} must remain parked`);
  assert.equal(queue("live-parent").status, "running", "startup cannot steal an unexpired worker lease");
  assert.equal(queue("live-parent").locked_by, "alive");
  assert.equal(queue("held-stale-child").status, "running", "pending admission never auto-recovers");
  assert.equal(queue("cancelled").status, "running", "cancelled run is not reactivated by queue recovery");
  assert.equal(queue("cancelled-queue").status, "cancelled");
  clock += 10_001;
  await seed(runFixture("still-waiting"), "waiting");
  await seed(childFixture("later-expired-child"), "running", { locked_by: "dead", locked_until: future, attempts: 1 });
  await contract.recoverCanvasIterationRuns({ restoreWaiting: false });
  assert.equal(queue("live-parent").status, "queued", "a subsequent recovery can recover a lease which expired after startup");
  assert.equal(queue("later-expired-child").status, "queued", "drain-time recovery also restores expired internal children");
  assert.equal(queue("still-waiting").status, "waiting", "drain-time recovery never wakes healthy waiting parents");
  assert.equal(queue("held-child").status, "waiting", "drain-time recovery never releases admission-held retries");
  await contract.recoverCanvasIterationRuns({ restoreWaiting: false });
  assert.equal(queue("still-waiting").status, "waiting", "repeated drain-time recovery does not create a polling loop");
  await contract.recoverCanvasIterationRuns({ restoreWaiting: true });
  assert.equal(queue("still-waiting").status, "queued", "startup reconciliation can explicitly restore waiting parents");

  reset();
  await seed(runFixture("parent"));
  const staleWorker = await claim("stale-worker");
  clock += 10_001;
  await contract.recoverCanvasIterationRuns();
  const replacement = await claim("replacement-worker");
  await contract.parkCanvasIterationRun(staleWorker.id, "stale-worker");
  await contract.finishCanvasRunQueueItem(staleWorker.id, "stale-worker", "failed");
  await contract.heartbeatCanvasRunQueueItem(staleWorker.id, "stale-worker", 60_000);
  assert.equal(queue().status, "running");
  assert.equal(queue().locked_by, replacement.lockedBy);
  assert.equal(queue().locked_until, replacement.lockedUntil, "stale worker cannot mutate a replacement lease");

  for (const status of ["completed", "failed", "cancelled"]) {
    reset();
    const child = childFixture("retry", { status, cancelRequestedAt: status === "cancelled" ? iso() : undefined });
    await seed(child, status, { locked_by: "stale", locked_until: iso(), completed_at: iso(), error: "old", data_json: '{"iterationWake":true}' });
    await contract.holdCanvasIterationItemQueue(child.id);
    assert.equal(queue(child.id).status, "waiting");
    assert.equal(queue(child.id).locked_by, null);
    assert.equal(queue(child.id).locked_until, null);
    assert.equal(queue(child.id).completed_at, null);
    assert.equal(queue(child.id).error, null);
    assert.equal(JSON.parse(queue(child.id).data_json).iterationWake, undefined);
    await contract.recoverCanvasIterationRuns();
    assert.equal(queue(child.id).status, "waiting", "crash between hold and retry save must not admit child");
    const retry = await contract.saveCanvasRunToDb({ ...child, status: "queued", cancelRequestedAt: undefined, iterationAdmissionPending: true }, { resetCancellation: true });
    await contract.wakeCanvasIterationRun(child.id);
    await contract.recoverCanvasIterationRuns();
    assert.equal(queue(child.id).status, "waiting", "only parent admission releases a retry child");
    assert.equal(await claim("premature"), undefined);
    await contract.saveCanvasRunToDb({ ...retry, iterationAdmissionPending: undefined });
    await contract.wakeCanvasIterationRun(child.id);
    assert.equal((await claim("admitted")).runId, child.id);
  }
  reset();
  await seed(runFixture("parent", { status: "failed" }), "failed");
  await contract.holdCanvasIterationItemQueue("parent");
  assert.equal(queue().status, "failed", "hold only applies to iteration children");
  await seed(childFixture("active-child"), "running", { locked_by: "active", locked_until: iso() });
  await contract.holdCanvasIterationItemQueue("active-child");
  assert.equal(queue("active-child").status, "running", "hold never steals an active child");

  reset();
  const stale = runFixture("parent");
  await contract.saveCanvasRunToDb(stale);
  clock += 1000;
  const cancelledAt = iso();
  await contract.saveCanvasRunToDb({ ...stale, cancelRequestedAt: cancelledAt, updatedAt: iso() });
  const afterStaleWrite = await contract.saveCanvasRunToDb({ ...stale, iterationWaiting: true });
  assert.equal(afterStaleWrite.cancelRequestedAt, cancelledAt, "whole-json update preserves cancellation written by another worker");
  assert.equal(afterStaleWrite.iterationWaiting, true, "cancellation preservation retains newly saved progress");
  assert.equal((await contract.getCanvasRunFromDb(stale.id)).cancelRequestedAt, cancelledAt);
  for (const status of ["completed", "failed", "partial", "running", "queued"]) {
    const saved = await contract.saveCanvasRunToDb({ ...stale, status, updatedAt: iso() });
    assert.equal(saved.status, "cancelled", "terminal cancellation cannot be overwritten or implicitly retried");
    assert.equal(saved.cancelRequestedAt, cancelledAt);
    assert.equal(database.prepare("SELECT status FROM canvas_runs WHERE id = ?").get(stale.id).status, "cancelled");
  }
  await assert.rejects(() => contract.saveCanvasRunToDb(stale, { resetCancellation: true }), /queued retry/);
  await assert.rejects(() => contract.saveCanvasRunToDb({ ...stale, status: "queued", cancelRequestedAt: cancelledAt }, { resetCancellation: true }), /queued retry/);
  const retried = await contract.saveCanvasRunToDb({ ...stale, status: "queued", retryNodeIds: ["region"] }, { resetCancellation: true });
  assert.equal(retried.status, "queued");
  assert.equal(retried.cancelRequestedAt, undefined);
  const executingRetry = await contract.saveCanvasRunToDb({ ...retried, status: "running" });
  assert.equal(executingRetry.status, "running");
  reset();
  await contract.saveCanvasRunToDb(runFixture("raw-cancel", { status: "cancelled" }));
  const rawCancelled = await contract.saveCanvasRunToDb(runFixture("raw-cancel", { status: "completed" }));
  assert.equal(rawCancelled.status, "cancelled", "legacy raw cancellation survives even without a cancellation timestamp");
  assert.ok(rawCancelled.cancelRequestedAt);

  reset();
  await contract.saveCanvasRunToDb(runFixture("outer-old", { createdAt: new Date(clock - 2000).toISOString() }));
  await contract.saveCanvasRunToDb(runFixture("outer-new", { createdAt: new Date(clock - 1000).toISOString(), iterationContext: null }));
  await contract.saveCanvasRunToDb(runFixture("other-workflow", { workflowId: "other", createdAt: new Date(clock - 500).toISOString() }));
  for (let index = 0; index < 55; index += 1) await contract.saveCanvasRunToDb(childFixture(`internal-${index}`));
  assert.deepEqual((await contract.listCanvasRunsFromDb(2)).map((run) => run.id), ["other-workflow", "outer-new"], "internal runs are excluded before global history LIMIT");
  assert.deepEqual((await contract.listCanvasRunsForWorkflowFromDb("workflow", 2)).map((run) => run.id), ["outer-new", "outer-old"], "internal runs are excluded before workflow history LIMIT");
  assert.equal((await contract.getCanvasRunFromDb("internal-0")).iterationContext.parentRunId, "parent", "direct child lookups remain available");

  for (const parentStatus of ["waiting", "running"]) {
    reset();
    await seed(runFixture("parent"), parentStatus, parentStatus === "running" ? { locked_by: "parent-worker", locked_until: new Date(clock + 10_000).toISOString(), attempts: 1 } : {});
    await seed(childFixture("child", { status: "completed" }), "running", { locked_by: "child-worker", locked_until: new Date(clock + 10_000).toISOString() });
    const previousLease = queue().locked_until;
    await contract.finishCanvasRunQueueItem("canvas-queue-child", "child-worker", "completed");
    assert.equal(queue("child").status, "completed");
    assert.equal(queue().status, parentStatus === "running" ? "running" : "queued", "child finish atomically notifies parent without runtime wake");
    assert.equal(JSON.parse(queue().data_json).iterationWake, true);
    if (parentStatus === "running") {
      assert.equal(queue().locked_by, "parent-worker");
      assert.equal(queue().locked_until, previousLease);
      assert.equal(await claim("duplicate-worker"), undefined);
      await contract.parkCanvasIterationRun("canvas-queue-parent", "parent-worker");
      assert.equal(queue().status, "queued", "atomic completion preserves wake-before-park");
    }
    const awakened = await claim("awakened-parent");
    await contract.parkCanvasIterationRun(awakened.id, "awakened-parent");
    if (queue().status === "queued") {
      const finalPass = await claim("parent-final-pass");
      await contract.parkCanvasIterationRun(finalPass.id, "parent-final-pass");
    }
    assert.equal(queue().status, "waiting");
    await contract.finishCanvasRunQueueItem("canvas-queue-child", "child-worker", "completed");
    assert.equal(queue().status, "waiting", "duplicate finish cannot repeatedly wake parent");
  }

  reset();
  await seed(runFixture("parent"), "waiting");
  await seed(childFixture("child", { status: "completed" }), "running", { locked_by: "child-worker", locked_until: new Date(clock + 10_000).toISOString() });
  database.exec(`CREATE TRIGGER reject_parent_wake BEFORE UPDATE ON canvas_run_queue
    WHEN OLD.run_id = 'parent' AND NEW.status = 'queued'
    BEGIN SELECT RAISE(ABORT, 'injected parent wake failure'); END;`);
  await assert.rejects(() => contract.finishCanvasRunQueueItem("canvas-queue-child", "child-worker", "completed"), /injected parent wake failure/);
  assert.equal(queue("child").status, "running", "parent wake failure rolls child queue completion back");
  assert.equal(queue("child").locked_by, "child-worker");
  assert.equal(queue().status, "waiting");
  database.exec("DROP TRIGGER reject_parent_wake");
  await contract.finishCanvasRunQueueItem("canvas-queue-child", "child-worker", "completed");
  assert.equal(queue("child").status, "completed");
  assert.equal(queue().status, "queued");

  for (const status of ["completed", "partial", "failed", "cancelled"]) {
    reset();
    await seed(runFixture("parent"), "waiting");
    await seed(childFixture("crashed-child", { status, completedAt: iso(), error: status === "failed" ? "provider failure" : undefined }), "running", { locked_by: "crashed-worker", locked_until: new Date(clock - 1).toISOString(), attempts: 1 });
    await contract.recoverCanvasIterationRuns({ restoreWaiting: false });
    assert.equal(queue("crashed-child").status, status === "partial" ? "failed" : status, "terminal run reconciles queue without provider execution");
    assert.equal(queue("crashed-child").locked_by, null);
    assert.equal(queue("crashed-child").locked_until, null);
    assert.equal(queue("crashed-child").completed_at, iso());
    assert.equal(queue("crashed-child").error, status === "failed" ? "provider failure" : null);
    assert.equal(queue().status, "queued", "terminal crash recovery wakes parent even with restoreWaiting disabled");
    assert.equal((await claim("reconciler")).runId, "parent");
    assert.equal(await claim("provider-must-not-run"), undefined);
  }

  reset();
  await seed(runFixture("parent"), "running", { locked_by: "parent-worker", locked_until: new Date(clock + 10_000).toISOString() });
  await seed(childFixture("null-lock-child", { status: "completed" }), "running", { locked_by: "dead-worker", locked_until: null });
  await contract.recoverCanvasIterationRuns({ restoreWaiting: false });
  assert.equal(queue("null-lock-child").status, "completed");
  assert.equal(queue().status, "running");
  assert.equal(queue().locked_by, "parent-worker");
  await contract.parkCanvasIterationRun("canvas-queue-parent", "parent-worker");
  assert.equal(queue().status, "queued", "terminal recovery also preserves active parent's wake-before-park");

  reset();
  await seed(runFixture("parent"), "waiting");
  await seed(childFixture("crashed-child", { status: "completed" }), "running", { locked_by: "crashed-worker", locked_until: new Date(clock - 1).toISOString() });
  database.exec(`CREATE TRIGGER reject_recovery_wake BEFORE UPDATE ON canvas_run_queue
    WHEN OLD.run_id = 'parent' AND NEW.status = 'queued'
    BEGIN SELECT RAISE(ABORT, 'injected recovery wake failure'); END;`);
  await assert.rejects(() => contract.recoverCanvasIterationRuns({ restoreWaiting: false }), /injected recovery wake failure/);
  assert.equal(queue("crashed-child").status, "running", "recovery notification failure also rolls terminalization back");
  assert.equal(queue().status, "waiting");
  database.exec("DROP TRIGGER reject_recovery_wake");
  await contract.recoverCanvasIterationRuns({ restoreWaiting: false });
  assert.equal(queue("crashed-child").status, "completed");
  assert.equal(queue().status, "queued");

  for (const parentStatus of ["completed", "failed", "cancelled"]) {
    reset();
    await seed(runFixture("parent", { status: parentStatus }), parentStatus);
    await seed(childFixture("child", { status: "completed" }), "running", { locked_by: "worker", locked_until: new Date(clock - 1).toISOString() });
    await contract.finishCanvasRunQueueItem("canvas-queue-child", "worker", "completed");
    assert.equal(queue().status, parentStatus, "atomic completion never revives a terminal parent");
  }
  reset();
  await seed(runFixture("parent"), "waiting");
  await seed(childFixture("foreign-child", { status: "completed", ownerUserId: "different-owner" }), "running", { locked_by: "worker", locked_until: new Date(clock - 1).toISOString() });
  await contract.finishCanvasRunQueueItem("canvas-queue-foreign-child", "worker", "completed");
  assert.equal(queue().status, "waiting", "child cannot wake a different owner's parent");
  await seed(childFixture("live-terminal-child", { status: "completed" }), "running", { locked_by: "live-worker", locked_until: new Date(clock + 10_000).toISOString() });
  await contract.recoverCanvasIterationRuns({ restoreWaiting: false });
  assert.equal(queue("live-terminal-child").status, "running", "recovery does not steal unexpired child finish lease");
  await contract.finishCanvasRunQueueItem("canvas-queue-live-terminal-child", "old-worker", "completed");
  assert.equal(queue().status, "waiting", "stale finish cannot notify parent");

  const postgres = load("postgres");
  await postgres.listCanvasRunsFromDb(2);
  await postgres.listCanvasRunsForWorkflowFromDb("workflow", 2);
  for (const call of postgresCalls.splice(0)) {
    assert.match(call.sql, /WHERE[\s\S]*data_json->>'iterationContext' IS NULL[\s\S]*ORDER BY[\s\S]*LIMIT/);
  }
  await postgres.finishCanvasRunQueueItem("queue", "worker", "completed");
  assert.equal(postgresCalls.length, 1, "PostgreSQL finish and wake use one atomic statement");
  assert.match(postgresCalls.at(-1).sql, /WITH finished AS[\s\S]*RETURNING run_id[\s\S]*UPDATE canvas_run_queue parent_queue/);
  assert.match(postgresCalls.at(-1).sql, /locked_by = \$5 AND status = 'running'/);
  assert.match(postgresCalls.at(-1).sql, /parent\.owner_user_id = child\.owner_user_id/);
  await postgres.wakeCanvasIterationRun("parent");
  assert.match(postgresCalls.at(-1).sql, /status IN \('queued', 'running', 'waiting'\)/);
  assert.match(postgresCalls.at(-1).sql, /iterationAdmissionPending/);
  await postgres.parkCanvasIterationRun("queue", "worker");
  assert.match(postgresCalls.at(-1).sql, /locked_by = \$3 AND status = 'running'/);
  await postgres.recoverCanvasIterationRuns();
  assert.match(postgresCalls.at(-2).sql, /WITH finished AS[\s\S]*child.status IN \('completed', 'partial', 'failed', 'cancelled'\)[\s\S]*RETURNING queue.run_id[\s\S]*UPDATE canvas_run_queue parent_queue/);
  assert.match(postgresCalls.at(-2).sql, /completedAt'\)::timestamptz/);
  assert.equal(postgresCalls.at(-1).values[1], true);
  assert.match(postgresCalls.at(-1).sql, /\$2 AND queue\.status = 'waiting'/);
  assert.match(postgresCalls.at(-1).sql, /queue\.locked_until IS NULL OR queue\.locked_until <= \$1/);
  assert.match(postgresCalls.at(-1).sql, /run\.status IN \('queued', 'running'\)/);
  assert.match(postgresCalls.at(-1).sql, /iterationAdmissionPending/);
  await postgres.recoverCanvasIterationRuns({ restoreWaiting: false });
  assert.equal(postgresCalls.at(-1).values[1], false);
  await postgres.holdCanvasIterationItemQueue("child");
  assert.match(postgresCalls.at(-1).sql, /iterationContext' IS NOT NULL/);
  await postgres.saveCanvasRunToDb(stale);
  assert.match(postgresCalls.at(-1).sql, /ON CONFLICT[\s\S]*cancelRequestedAt[\s\S]*RETURNING data_json/);
  assert.equal(postgresCalls.at(-1).values[7], false);
  await postgres.saveCanvasRunToDb({ ...stale, status: "queued" }, { resetCancellation: true });
  assert.equal(postgresCalls.at(-1).values[7], true);
  console.log("Canvas iteration SQLite queue checks passed: wake/park races, leases, recovery, retry admission, cancellation, history limits; PostgreSQL SQL shape checks passed.");
} finally {
  database.close();
}
