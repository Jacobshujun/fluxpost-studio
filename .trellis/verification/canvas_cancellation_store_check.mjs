import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

const source = readFileSync("src/lib/database.ts", "utf8");
const ast = ts.createSourceFile("database.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const names = ["cancelCanvasRunInDb", "saveCanvasRunToDb", "getCanvasRunFromDb", "saveCanvasNodeRunToDb", "getCanvasNodeRunFromDb",
  "saveCancelledCanvasNodeReceiptInDb",
  "enqueueCanvasRunQueueItem", "canvasRunQueueItem", "requeueCanvasRunQueueItem", "updateCanvasScheduleInDb",
  "launchCanvasScheduleInDb", "fanOutCanvasScheduleV2ChildrenInDb", "runSqliteTransaction", "toJson", "fromJson"];
const declarations = names.map((name) => {
  const declaration = ast.statements.find((entry) => ts.isFunctionDeclaration(entry) && entry.name?.text === name);
  assert.ok(declaration, `Missing database function ${name}`);
  return declaration.getText(ast).replace(/^export\s+/, "");
});
const compiled = ts.transpileModule(declarations.join("\n"), { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText;
const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE canvas_runs (id TEXT PRIMARY KEY, workflow_id TEXT, owner_user_id TEXT, status TEXT, created_at TEXT, updated_at TEXT, data_json TEXT);
  CREATE TABLE canvas_node_runs (id TEXT PRIMARY KEY, run_id TEXT, node_id TEXT, node_type TEXT, attempt INTEGER, status TEXT, created_at TEXT, updated_at TEXT, data_json TEXT);
  CREATE TABLE canvas_run_queue (id TEXT PRIMARY KEY, run_id TEXT UNIQUE, status TEXT, priority INTEGER, attempts INTEGER, max_attempts INTEGER,
    run_after TEXT, locked_by TEXT, locked_until TEXT, created_at TEXT, updated_at TEXT, started_at TEXT, completed_at TEXT, error TEXT, data_json TEXT);
  CREATE TABLE canvas_schedules (id TEXT PRIMARY KEY, owner_user_id TEXT, workflow_id TEXT, status TEXT, revision INTEGER, created_at TEXT, updated_at TEXT, data_json TEXT);
`);
const calls = [];
let pgRun;
const pgClient = {
  async query(sql, values) {
    calls.push({ sql, values });
    if (/SELECT data_json FROM canvas_runs/.test(sql)) return { rows: pgRun ? [{ data_json: pgRun }] : [] };
    if (/RETURNING data_json/.test(sql)) return { rows: [{ data_json: values?.[/INSERT INTO canvas_node_runs/.test(sql) ? 8 : 6] || "{}" }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  },
  release() { calls.push({ release: true }); },
};
const load = (backend) => Function("ensureDatabaseReady", "getDatabaseBackend", "getSqliteDatabase", "getPostgresPool",
  `${compiled}\nreturn {${names.join(",")}};`)(async () => {}, () => backend, () => db, () => ({ ...pgClient, connect: async () => pgClient }));
const store = load("sqlite");
const now = "2026-10-19T03:30:00.000Z";
const run = (id, status = "running", extra = {}) => ({ id, status, workflowId: "workflow", ownerUserId: "owner", createdAt: now, updatedAt: now, ...extra });
const node = (id, runId, status = "running", extra = {}) => ({ id, runId, nodeId: id, nodeType: "utility.image-process", attempt: 1, status,
  inputs: {}, outputs: {}, createdAt: now, updatedAt: now, ...extra });
const queue = (id) => db.prepare("SELECT * FROM canvas_run_queue WHERE run_id = ?").get(id);
const seed = async (id, status, queueStatus) => {
  const value = run(id, status);
  await store.saveCanvasRunToDb(value);
  await store.enqueueCanvasRunQueueItem(value);
  db.prepare("UPDATE canvas_run_queue SET status = ?, locked_by = 'dead-worker', locked_until = ? WHERE run_id = ?").run(queueStatus, now, id);
  return value;
};
try {
  for (const [status, queueStatus] of [["queued", "queued"], ["running", "running"], ["running", "waiting"]]) {
    const id = `${status}-${queueStatus}`;
    const original = await seed(id, status, queueStatus);
    const metadata = { iteration: { items: [{ id: "item", status: "running" }] }, checkpoint: "keep" };
    await store.saveCanvasNodeRunToDb(node(`${id}-pending`, id, "queued", { internalMetadata: metadata }));
    const completed = node(`${id}-success`, id, "completed", { outputs: { receipt: { kind: "text", value: "published-once" } }, completedAt: now });
    await store.saveCanvasNodeRunToDb(completed);
    const cancelled = await store.cancelCanvasRunInDb(id);
    assert.equal(cancelled.status, "cancelled");
    assert.ok(cancelled.cancelRequestedAt && cancelled.completedAt);
    assert.equal(queue(id).status, "cancelled");
    assert.equal(queue(id).locked_by, null);
    assert.equal(queue(id).locked_until, null);
    assert.equal(JSON.parse(queue(id).data_json).status, "cancelled");
    const pending = await store.getCanvasNodeRunFromDb(`${id}-pending`);
    assert.equal(pending.status, "cancelled");
    assert.deepEqual(pending.internalMetadata, metadata);
    assert.deepEqual(await store.getCanvasNodeRunFromDb(completed.id), completed, "published receipt survives cancellation");
    assert.deepEqual(await store.saveCanvasNodeRunToDb({ ...completed, outputs: {} }), completed, "late duplicate success save cannot erase published receipt after cancellation");
    const lateSave = await store.saveCanvasRunToDb({ ...original, status: "completed", graphSnapshot: { nodes: ["late-overwrite"] } });
    assert.equal(lateSave.status, "cancelled");
    assert.equal(lateSave.completedAt, cancelled.completedAt, "late write cannot discard cancellation completion timestamp");
    assert.equal(lateSave.graphSnapshot, undefined, "late stale run data cannot replace cancelled snapshot");
    assert.deepEqual(await store.saveCanvasNodeRunToDb({ ...pending, status: "completed", outputs: { late: { kind: "text", value: "discard" } } }), pending);
    assert.equal((await store.saveCanvasNodeRunToDb(node(`${id}-late-insert`, id))).status, "cancelled", "late insertion cannot become runnable");
    assert.equal(await store.requeueCanvasRunQueueItem(id), false);
    const repeated = await store.cancelCanvasRunInDb(id);
    assert.equal(repeated.cancelRequestedAt, cancelled.cancelRequestedAt);
    assert.equal(repeated.completedAt, cancelled.completedAt);
    const retried = await store.saveCanvasRunToDb({ ...original, status: "queued", cancelRequestedAt: undefined }, { resetCancellation: true });
    assert.equal(retried.status, "queued");
    assert.equal(await store.requeueCanvasRunQueueItem(id), true);
    assert.equal((await store.saveCanvasNodeRunToDb(node(`${id}-retry`, id, "running", { attempt: 2 }))).status, "running");
    assert.equal((await store.saveCanvasNodeRunToDb({ ...pending, status: "running" })).status, "cancelled", "retry creates new attempts; old cancelled attempt cannot revive");
  }
  for (const status of ["completed", "partial", "failed"]) {
    const original = await seed(`terminal-${status}`, status, status === "partial" ? "completed" : status);
    assert.deepEqual(await store.cancelCanvasRunInDb(original.id), original, `${status} run preserved`);
    assert.equal(queue(original.id).status, status === "partial" ? "completed" : status);
  }
  assert.equal(await store.cancelCanvasRunInDb("missing"), undefined);
  const receiptRun = await seed("late-receipt", "running", "running");
  const receiptAttempt = node("late-receipt-node", receiptRun.id, "running", { nodeType: "publish.feishu" });
  await store.saveCanvasNodeRunToDb(receiptAttempt);
  const submitted = { ...receiptAttempt, providerTaskId: "accepted-task", providerTaskRoute: "primary", providerStatus: "accepted",
    outputs: { job: { kind: "publishJobRef", jobId: "accepted-job", status: "queued" }, unrelated: { kind: "text", value: "must-not-deliver" } } };
  await store.saveCancelledCanvasNodeReceiptInDb(submitted);
  assert.deepEqual(await store.getCanvasNodeRunFromDb(receiptAttempt.id), receiptAttempt, "receipt-only path never changes an active attempt");
  await store.cancelCanvasRunInDb(receiptRun.id);
  const closedReceipt = await store.getCanvasNodeRunFromDb(receiptAttempt.id);
  await store.saveCancelledCanvasNodeReceiptInDb(submitted);
  const retainedReceipt = await store.getCanvasNodeRunFromDb(receiptAttempt.id);
  assert.equal(retainedReceipt.status, "cancelled");
  assert.equal(retainedReceipt.completedAt, closedReceipt.completedAt);
  assert.equal(retainedReceipt.providerTaskId, "accepted-task");
  assert.deepEqual(retainedReceipt.outputs, { job: submitted.outputs.job });
  await store.saveCancelledCanvasNodeReceiptInDb({ ...submitted, outputs: { job: { ...submitted.outputs.job, jobId: "stale-replacement" } } });
  assert.equal((await store.getCanvasNodeRunFromDb(receiptAttempt.id)).outputs.job.jobId, "accepted-job", "receipt checkpoint cannot replace an already recorded publish job");

  const atomic = await seed("atomic-rollback", "running", "running");
  await store.saveCanvasNodeRunToDb(node("atomic-node", atomic.id));
  db.exec("CREATE TRIGGER reject_cancel BEFORE UPDATE ON canvas_run_queue WHEN NEW.run_id = 'atomic-rollback' BEGIN SELECT RAISE(ABORT, 'fixture rollback'); END;");
  await assert.rejects(() => store.cancelCanvasRunInDb(atomic.id), /fixture rollback/);
  assert.equal((await store.getCanvasRunFromDb(atomic.id)).status, "running");
  assert.equal((await store.getCanvasNodeRunFromDb("atomic-node")).status, "running", "node cancellation rolls back with run and queue");
  db.exec("DROP TRIGGER reject_cancel;");

  const schedule = { id: "cancelled-schedule", ownerUserId: "owner", workflowId: "workflow", status: "cancelled", revision: 3, updatedAt: now };
  db.prepare("INSERT INTO canvas_schedules (id, status, revision, data_json) VALUES (?, ?, ?, ?)").run(schedule.id, schedule.status, schedule.revision, JSON.stringify(schedule));
  const staleSchedule = { ...schedule, status: "running", revision: 4 };
  assert.equal(await store.updateCanvasScheduleInDb(staleSchedule, 3), false, "matching revision cannot revive cancelled schedule");
  const extraRun = run("forbidden-fan-out", "queued");
  await assert.rejects(() => store.fanOutCanvasScheduleV2ChildrenInDb(staleSchedule, 3, [extraRun]), /revision conflict/);
  await assert.rejects(() => store.launchCanvasScheduleInDb(staleSchedule, 3, [extraRun]), /revision conflict/);
  assert.equal(await store.getCanvasRunFromDb(extraRun.id), undefined);
  const aggregate = await store.saveCanvasRunToDb(run("late-aggregate", "queued", { batchContext: { scheduleId: schedule.id } }), { requireActiveSchedule: true });
  assert.equal(aggregate.status, "cancelled", "late aggregate admission is atomically cancelled");
  await store.enqueueCanvasRunQueueItem(aggregate, { requireActiveRun: true });
  assert.equal(queue(aggregate.id), undefined, "cancelled run cannot enqueue through guarded admission");
  assert.equal(await store.updateCanvasScheduleInDb(staleSchedule, 3, { resetCancellation: true }), true, "explicit failed-subtask retry can resume cancelled schedule");
  const admitted = await store.saveCanvasRunToDb(run("active-aggregate", "queued", { batchContext: { scheduleId: schedule.id } }), { requireActiveSchedule: true });
  assert.equal(admitted.status, "queued");
  await store.enqueueCanvasRunQueueItem(admitted, { requireActiveRun: true });
  assert.equal(queue(admitted.id).status, "queued");

  const postgres = load("postgres");
  pgRun = run("pg-cancel");
  await postgres.cancelCanvasRunInDb(pgRun.id);
  const cancelCalls = calls.splice(0);
  assert.match(cancelCalls[0].sql, /BEGIN/);
  assert.match(cancelCalls[1].sql, /FOR UPDATE/);
  assert.match(cancelCalls[3].sql, /data_json = data_json \|\|[\s\S]*status IN \('queued', 'running'\)/);
  assert.match(cancelCalls[4].sql, /locked_by = NULL, locked_until = NULL[\s\S]*'waiting'/);
  assert.match(cancelCalls[5].sql, /COMMIT/);
  assert.equal(cancelCalls[6].release, true);
  await postgres.saveCanvasNodeRunToDb(node("pg-node", pgRun.id));
  assert.match(calls.at(-1).sql, /WITH owner AS MATERIALIZED[\s\S]*FOR UPDATE[\s\S]*canvas_node_runs.status <> 'cancelled'/);
  await postgres.saveCanvasRunToDb(run("pg-aggregate", "queued", { batchContext: { scheduleId: schedule.id } }), { requireActiveSchedule: true });
  assert.match(calls.at(-1).sql, /schedule_fence AS MATERIALIZED[\s\S]*FOR SHARE[\s\S]*cancelRequestedAt/);
  await postgres.enqueueCanvasRunQueueItem(admitted, { requireActiveRun: true });
  assert.match(calls.at(-1).sql, /FROM canvas_runs[\s\S]*cancelRequestedAt[\s\S]*FOR SHARE/);
  await postgres.updateCanvasScheduleInDb(staleSchedule, 3);
  assert.match(calls.at(-1).sql, /status <> 'cancelled' OR \$2 = 'cancelled' OR \$8/);
  assert.equal(calls.at(-1).values[7], false);
  console.log("Canvas cancellation store checks passed: atomic SQLite cancellation/rollback, preserved results, stale writes, retries, schedule fences; PostgreSQL SQL contracts.");
} finally {
  db.close();
}

if (process.argv.includes("--postgres")) {
  assert.ok(process.env.DATABASE_URL, "--postgres requires caller-provided DATABASE_URL");
  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`
      CREATE TEMP TABLE canvas_runs (id TEXT PRIMARY KEY, workflow_id TEXT, owner_user_id TEXT, status TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, data_json JSONB);
      CREATE TEMP TABLE canvas_node_runs (id TEXT PRIMARY KEY, run_id TEXT, node_id TEXT, node_type TEXT, attempt INTEGER, status TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, data_json JSONB);
      CREATE TEMP TABLE canvas_run_queue (id TEXT PRIMARY KEY, run_id TEXT UNIQUE, status TEXT, priority INTEGER, attempts INTEGER, max_attempts INTEGER,
        run_after TIMESTAMPTZ, locked_by TEXT, locked_until TIMESTAMPTZ, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, error TEXT, data_json JSONB);
      CREATE TEMP TABLE canvas_schedules (id TEXT PRIMARY KEY, owner_user_id TEXT, workflow_id TEXT, status TEXT, revision INTEGER, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, data_json JSONB);
      SET search_path = pg_temp, public;
    `);
    for (const table of ["canvas_runs", "canvas_node_runs", "canvas_run_queue", "canvas_schedules"]) {
      const location = await client.query("SELECT n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.oid = to_regclass($1)", [table]);
      assert.match(location.rows[0]?.nspname || "", /^pg_temp_/, `${table} must shadow runtime tables before writes`);
    }
    const pool = { query: client.query.bind(client), connect: async () => ({ query: client.query.bind(client), release() {} }) };
    const pg = Function("ensureDatabaseReady", "getDatabaseBackend", "getSqliteDatabase", "getPostgresPool",
      `${compiled}\nreturn {${names.join(",")}};`)(async () => {}, () => "postgres", () => { throw new Error("PostgreSQL test cannot use SQLite"); }, () => pool);
    const pgQueue = async (runId) => (await client.query("SELECT * FROM canvas_run_queue WHERE run_id = $1", [runId])).rows[0];
    for (const [status, queueStatus] of [["queued", "queued"], ["running", "running"], ["running", "waiting"]]) {
      const original = run(`pg-${status}-${queueStatus}`, status);
      await pg.saveCanvasRunToDb(original);
      await pg.enqueueCanvasRunQueueItem(original, { requireActiveRun: true });
      await client.query("UPDATE canvas_run_queue SET status = $1, locked_by = 'dead-worker', locked_until = $2 WHERE run_id = $3", [queueStatus, now, original.id]);
      const unfinished = node(`${original.id}-pending`, original.id, "running", { internalMetadata: { checkpoint: "keep" } });
      const success = node(`${original.id}-success`, original.id, "completed", { outputs: { receipt: { kind: "text", value: "published-once" } } });
      await pg.saveCanvasNodeRunToDb(unfinished);
      await pg.saveCanvasNodeRunToDb(success);
      const cancelled = await pg.cancelCanvasRunInDb(original.id);
      assert.equal(cancelled.status, "cancelled");
      assert.ok(cancelled.completedAt && cancelled.cancelRequestedAt);
      const item = await pgQueue(original.id);
      assert.equal(item.status, "cancelled");
      assert.equal(item.locked_by, null);
      assert.equal(item.locked_until, null);
      assert.equal(item.data_json.status, "cancelled");
      const closed = await pg.getCanvasNodeRunFromDb(unfinished.id);
      assert.equal(closed.status, "cancelled");
      assert.deepEqual(closed.internalMetadata, unfinished.internalMetadata);
      assert.deepEqual(await pg.saveCanvasNodeRunToDb({ ...success, outputs: {} }), success, "PostgreSQL late duplicate preserves publish receipt");
      assert.equal((await pg.saveCanvasRunToDb({ ...original, status: "completed" })).status, "cancelled");
      assert.equal((await pg.saveCanvasNodeRunToDb({ ...unfinished, status: "completed" })).status, "cancelled");
      assert.equal((await pg.saveCanvasNodeRunToDb(node(`${original.id}-late`, original.id))).status, "cancelled");
      assert.equal(await pg.requeueCanvasRunQueueItem(original.id), false);
      assert.equal((await pg.cancelCanvasRunInDb(original.id)).completedAt, cancelled.completedAt);
      await pg.saveCanvasRunToDb({ ...original, status: "queued" }, { resetCancellation: true });
      assert.equal(await pg.requeueCanvasRunQueueItem(original.id), true);
      assert.equal((await pg.saveCanvasNodeRunToDb(node(`${original.id}-retry`, original.id, "running", { attempt: 2 }))).status, "running");
      assert.equal((await pg.saveCanvasNodeRunToDb(unfinished)).status, "cancelled");
    }
    for (const status of ["completed", "partial", "failed"]) {
      const terminal = run(`pg-terminal-${status}`, status);
      await pg.saveCanvasRunToDb(terminal);
      assert.deepEqual(await pg.cancelCanvasRunInDb(terminal.id), terminal);
    }
    await pg.saveCanvasRunToDb(run("pg-late-receipt"));
    const pgReceiptAttempt = node("pg-receipt-node", "pg-late-receipt", "running", { nodeType: "publish.feishu" });
    await pg.saveCanvasNodeRunToDb(pgReceiptAttempt);
    await pg.cancelCanvasRunInDb(pgReceiptAttempt.runId);
    const pgSubmittedOutputs = { job: { kind: "publishJobRef", jobId: "accepted-job", status: "queued" }, unrelated: { kind: "text", value: "must-not-deliver" } };
    await pg.saveCancelledCanvasNodeReceiptInDb({ ...pgReceiptAttempt, providerTaskId: "accepted-task", outputs: pgSubmittedOutputs });
    const pgReceipt = await pg.getCanvasNodeRunFromDb(pgReceiptAttempt.id);
    assert.equal(pgReceipt.status, "cancelled");
    assert.equal(pgReceipt.providerTaskId, "accepted-task");
    assert.deepEqual(pgReceipt.outputs, { job: pgSubmittedOutputs.job });
    const pgSchedule = { id: "pg-cancelled-schedule", ownerUserId: "owner", status: "cancelled", revision: 3, updatedAt: now };
    await client.query("INSERT INTO canvas_schedules (id, status, revision, data_json) VALUES ($1, $2, $3, $4::jsonb)", [pgSchedule.id, pgSchedule.status, pgSchedule.revision, JSON.stringify(pgSchedule)]);
    const stale = { ...pgSchedule, status: "running", revision: 4 };
    assert.equal(await pg.updateCanvasScheduleInDb(stale, 3), false);
    await assert.rejects(() => pg.launchCanvasScheduleInDb(stale, 3, [run("pg-forbidden-launch", "queued")]), /revision conflict/);
    await assert.rejects(() => pg.fanOutCanvasScheduleV2ChildrenInDb(stale, 3, [run("pg-forbidden-fanout", "queued")]), /revision conflict/);
    assert.equal(await pg.getCanvasRunFromDb("pg-forbidden-launch"), undefined);
    assert.equal(await pg.getCanvasRunFromDb("pg-forbidden-fanout"), undefined);
    const lateAggregate = await pg.saveCanvasRunToDb(run("pg-late-aggregate", "queued", { batchContext: { scheduleId: pgSchedule.id } }), { requireActiveSchedule: true });
    assert.equal(lateAggregate.status, "cancelled");
    await pg.enqueueCanvasRunQueueItem(lateAggregate, { requireActiveRun: true });
    assert.equal(await pgQueue(lateAggregate.id), undefined);
    assert.equal(await pg.updateCanvasScheduleInDb(stale, 3, { resetCancellation: true }), true);
    const activeAggregate = await pg.saveCanvasRunToDb(run("pg-active-aggregate", "queued", { batchContext: { scheduleId: pgSchedule.id } }), { requireActiveSchedule: true });
    assert.equal(activeAggregate.status, "queued");
    await pg.enqueueCanvasRunQueueItem(activeAggregate, { requireActiveRun: true });
    assert.equal((await pgQueue(activeAggregate.id)).status, "queued");
    console.log("Canvas cancellation PostgreSQL temporary-table execution passed: run/node/queue cancellation, receipt preservation, late writes, retries and schedule admission fences.");
  } finally {
    await client.end();
  }
}
