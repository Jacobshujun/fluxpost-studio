import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";

class RecoveryError extends Error {}

const active = new Set(["pending", "queued", "running", "waiting", "paused"]);
const successful = new Set(["completed", "partial", "reused", "bypassed"]);
const decode = (row) => typeof row.data_json === "string" ? JSON.parse(row.data_json) : structuredClone(row.data_json);

export function parseArgs(args) {
  const options = { scheduleIds: [], interruptedRunIds: [], apply: false };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--apply") { options.apply = true; continue; }
    const target = args[i] === "--schedule-id" ? options.scheduleIds : args[i] === "--interrupted-run-id" ? options.interruptedRunIds : undefined;
    if (!target || !args[i + 1] || !/^[a-zA-Z0-9_-]{1,180}$/.test(args[i + 1])) throw new RecoveryError("Expected --schedule-id ID, --interrupted-run-id ID, or --apply.");
    target.push(args[++i]);
  }
  options.scheduleIds = [...new Set(options.scheduleIds)];
  options.interruptedRunIds = [...new Set(options.interruptedRunIds)];
  if (!options.scheduleIds.length && !options.interruptedRunIds.length) throw new RecoveryError("At least one explicit schedule or interrupted run ID is required.");
  return options;
}

export function assertLocalDatabase(connectionString) {
  let url;
  try { url = new URL(connectionString); } catch { throw new RecoveryError("A local PostgreSQL DATABASE_URL is required."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.searchParams.has("host") || url.searchParams.has("hostaddr")) {
    throw new RecoveryError("Recovery requires a loopback PostgreSQL connection without host overrides.");
  }
}

export function assertDeadWorker(lockedBy, isAlive = processIsAlive) {
  const match = /^canvas-worker-([1-9]\d*)-\d+-\d+$/.exec(lockedBy || "");
  if (!match || !Number.isSafeInteger(Number(match[1]))) throw new RecoveryError("Interrupted run has no unambiguous local Canvas worker PID.");
  if (isAlive(Number(match[1]))) throw new RecoveryError("Interrupted run worker PID is still alive; recovery refused.");
}

function processIsAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) {
    if (error.code === "ESRCH") return false;
    throw new RecoveryError("Worker PID liveness is ambiguous; recovery refused.");
  }
}

function cancelTask(task, now) {
  if (active.has(task.status)) Object.assign(task, { status: "cancelled", updatedAt: now });
}

function cancelSchedule(row, now) {
  const data = decode(row);
  data.status = "cancelled";
  data.updatedAt = now;
  data.completedAt ||= now;
  data.revision = row.revision + 1;
  for (const main of data.mainTasks || []) {
    cancelTask(main, now);
    if (active.has(main.sharedStatus)) { main.sharedStatus = "cancelled"; main.updatedAt = now; }
    for (const child of main.childTasks || []) cancelTask(child, now);
  }
  for (const batch of data.batches || []) {
    cancelTask(batch, now);
    for (const content of batch.contentTasks || []) {
      cancelTask(content, now);
      for (const image of content.imageTasks || []) cancelTask(image, now);
    }
  }
  return { ...row, status: data.status, revision: data.revision, updated_at: now, data_json: data };
}

function setStatus(row, status, now, extra = {}) {
  const data = { ...decode(row), status, updatedAt: now, ...extra };
  if (status === "cancelled") data.completedAt ||= now;
  return { ...row, status, updated_at: now, data_json: data };
}

function changeQueue(row, status, now) {
  const result = setStatus(row, status, now);
  result.locked_by = result.locked_until = null;
  delete result.data_json.lockedBy;
  delete result.data_json.lockedUntil;
  if (status === "queued") {
    result.attempts = result.data_json.attempts = 0;
    result.run_after = result.data_json.runAfter = now;
    result.started_at = result.completed_at = result.error = null;
    delete result.data_json.startedAt;
    delete result.data_json.completedAt;
    delete result.data_json.error;
  } else result.completed_at = result.data_json.completedAt;
  return result;
}

export function planRecovery(snapshot, options, { now = new Date().toISOString(), isAlive } = {}) {
  const changes = { schedules: [], runs: [], nodes: [], queues: [] };
  const cancelRunIds = new Set();
  const scheduleMap = new Map(snapshot.schedules.map((row) => [row.id, row]));
  const runMap = new Map(snapshot.runs.map((row) => [row.id, row]));
  const queueMap = new Map(snapshot.queues.map((row) => [row.run_id, row]));
  const owns = (run, scheduleId) => {
    const seen = new Set();
    let current = run;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      const data = decode(current);
      if (data.batchContext?.scheduleId === scheduleId) return true;
      current = runMap.get(data.iterationContext?.parentRunId);
    }
    return false;
  };
  for (const id of options.scheduleIds) {
    const row = scheduleMap.get(id);
    if (!row) throw new RecoveryError(`Schedule not found: ${id}`);
    const runs = snapshot.runs.filter((run) => owns(run, id));
    if (row.status !== "cancelled" && !runs.some((run) => active.has(run.status) && decode(run).cancelRequestedAt)) throw new RecoveryError(`No existing cancellation intent for schedule: ${id}`);
    changes.schedules.push(cancelSchedule(row, now));
    for (const run of runs) if (active.has(run.status) || run.status === "cancelled") cancelRunIds.add(run.id);
  }
  for (const id of options.interruptedRunIds) {
    if (cancelRunIds.has(id)) continue;
    const row = runMap.get(id);
    const queue = queueMap.get(id);
    if (!row || !queue || queue.status !== "running") throw new RecoveryError(`Interrupted run must have a running queue entry: ${id}`);
    assertDeadWorker(queue.locked_by, isAlive);
    const run = decode(row);
    const scheduleId = run.batchContext?.scheduleId;
    const schedule = scheduleId ? scheduleMap.get(scheduleId) : undefined;
    if (scheduleId && !schedule) throw new RecoveryError(`Owning schedule is missing for run: ${id}`);
    if (run.cancelRequestedAt || row.status === "cancelled" || schedule?.status === "cancelled") { cancelRunIds.add(id); continue; }
    if (row.status !== "running") throw new RecoveryError(`Interrupted run must still be running: ${id}`);
    const latest = new Map();
    for (const node of snapshot.nodes.filter((item) => item.run_id === id)) {
      if (!latest.has(node.node_id) || node.attempt > latest.get(node.node_id).attempt) latest.set(node.node_id, node);
    }
    const unfinished = [...latest.values()].filter((node) => !successful.has(node.status) && node.status !== "disabled");
    if (!unfinished.some((node) => active.has(node.status)) || unfinished.some((node) => node.node_type !== "utility.image-process")) throw new RecoveryError(`Only interrupted image-processing nodes may resume: ${id}`);
    if ((run.retryNodeIds || []).some((nodeId) => successful.has(latest.get(nodeId)?.status))) throw new RecoveryError(`Retry would replay a successful node: ${id}`);
    const resumed = setStatus(row, "queued", now);
    delete resumed.data_json.completedAt;
    delete resumed.data_json.error;
    delete resumed.data_json.waitReason;
    changes.runs.push(resumed);
    changes.queues.push(changeQueue(queue, "queued", now));
  }
  for (const id of cancelRunIds) {
    const row = runMap.get(id);
    changes.runs.push(setStatus(row, "cancelled", now, { cancelRequestedAt: decode(row).cancelRequestedAt || now }));
    for (const node of snapshot.nodes.filter((item) => item.run_id === id && active.has(item.status))) changes.nodes.push(setStatus(node, "cancelled", now));
    const queue = queueMap.get(id);
    if (queue && active.has(queue.status)) changes.queues.push(changeQueue(queue, "cancelled", now));
  }
  return changes;
}

async function loadSnapshot(client, options) {
  // Discover schedule IDs, then take schedule locks before run/queue locks, matching application lock order.
  const discovered = await client.query("SELECT * FROM canvas_runs WHERE id = ANY($1::text[])", [options.interruptedRunIds]);
  const scheduleIds = [...new Set([...options.scheduleIds, ...discovered.rows.map((row) => decode(row).batchContext?.scheduleId).filter(Boolean)])];
  const schedules = await client.query("SELECT * FROM canvas_schedules WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE", [scheduleIds]);
  const runs = await client.query(`WITH RECURSIVE scoped AS (
    SELECT id FROM canvas_runs WHERE id = ANY($1::text[]) OR data_json->'batchContext'->>'scheduleId' = ANY($2::text[])
    UNION SELECT child.id FROM canvas_runs child JOIN scoped parent ON child.data_json->'iterationContext'->>'parentRunId' = parent.id
  ) SELECT * FROM canvas_runs WHERE id IN (SELECT id FROM scoped) ORDER BY id FOR UPDATE`, [options.interruptedRunIds, options.scheduleIds]);
  for (const id of options.interruptedRunIds) {
    const run = runs.rows.find((row) => row.id === id);
    const original = discovered.rows.find((row) => row.id === id);
    if (run && (!original || decode(run).batchContext?.scheduleId !== decode(original).batchContext?.scheduleId)) throw new RecoveryError("Run schedule changed while acquiring recovery locks.");
  }
  const runIds = runs.rows.map((row) => row.id);
  const nodes = await client.query("SELECT * FROM canvas_node_runs WHERE run_id = ANY($1::text[]) ORDER BY id FOR UPDATE", [runIds]);
  const queues = await client.query("SELECT * FROM canvas_run_queue WHERE run_id = ANY($1::text[]) ORDER BY id FOR UPDATE", [runIds]);
  return { schedules: schedules.rows, runs: runs.rows, nodes: nodes.rows, queues: queues.rows };
}

async function saveBackup(snapshot, changes) {
  const touched = Object.fromEntries(Object.entries(changes).map(([table, rows]) => {
    const ids = new Set(rows.map((row) => row.id));
    return [table, snapshot[table].filter((row) => ids.has(row.id))];
  }));
  const directory = path.resolve("data/reports");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = `canvas-cancellation-recovery-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.json`;
  await writeFile(path.join(directory, filename), JSON.stringify({ createdAt: new Date().toISOString(), before: touched }, null, 2), { mode: 0o600, flag: "wx" });
  return `data/reports/${filename}`;
}

export async function recover(client, options, { backup = saveBackup, isAlive } = {}) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query("SET LOCAL lock_timeout = '2s'");
    const snapshot = await loadSnapshot(client, options);
    const changes = planRecovery(snapshot, options, { isAlive });
    const count = Object.values(changes).reduce((sum, rows) => sum + rows.length, 0);
    const backupPath = options.apply && count ? await backup(snapshot, changes) : undefined;
    if (options.apply) {
      for (const row of changes.schedules) await client.query("UPDATE canvas_schedules SET status=$1, revision=$2, updated_at=$3, data_json=$4::jsonb WHERE id=$5", [row.status, row.revision, row.updated_at, JSON.stringify(row.data_json), row.id]);
      for (const [key, table] of [["runs", "canvas_runs"], ["nodes", "canvas_node_runs"]]) {
        for (const row of changes[key]) await client.query(`UPDATE ${table} SET status=$1, updated_at=$2, data_json=$3::jsonb WHERE id=$4`, [row.status, row.updated_at, JSON.stringify(row.data_json), row.id]);
      }
      for (const row of changes.queues) await client.query("UPDATE canvas_run_queue SET status=$1, updated_at=$2, attempts=$3, run_after=$4, locked_by=$5, locked_until=$6, started_at=$7, completed_at=$8, error=$9, data_json=$10::jsonb WHERE id=$11", [row.status, row.updated_at, row.attempts, row.run_after, row.locked_by, row.locked_until, row.started_at, row.completed_at, row.error, JSON.stringify(row.data_json), row.id]);
    }
    await client.query(options.apply ? "COMMIT" : "ROLLBACK");
    return { mode: options.apply ? "apply" : "dry-run", backupPath, counts: Object.fromEntries(Object.entries(changes).map(([table, rows]) => [table, rows.length])), changes: Object.fromEntries(Object.entries(changes).map(([table, rows]) => [table, rows.map(({ id, status }) => ({ id, status }))])) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertLocalDatabase(process.env.DATABASE_URL);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, application_name: "fluxpost-scoped-canvas-recovery", max: 1, connectionTimeoutMillis: 5000 });
  try {
    const client = await pool.connect();
    try { console.log(JSON.stringify(await recover(client, options))); } finally { client.release(); }
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    // Database errors can contain row values or credentials. Only our bounded validation messages are safe to print.
    const safe = error instanceof RecoveryError;
    console.error(safe ? error.message : "Local Canvas recovery failed; transaction rolled back.");
    process.exitCode = 1;
  });
}
