import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import ts from "typescript";

function functions(file, names, scope) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const body = names.map((name) => {
    const declaration = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert(declaration, name);
    return declaration.getText(source).replace(/^export /, "");
  }).join("\n");
  const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return Function(...Object.keys(scope), `${compiled}; return {${names.join(",")}}`)(...Object.values(scope));
}

const queryModule = { exports: {} };
new Function("module", "exports", ts.transpileModule(readFileSync("src/lib/canvas/history-query.ts", "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText)(queryModule, queryModule.exports);
const { canvasHistoryQuery, canvasHistoryPageSize } = queryModule.exports;
const postgres = process.env.CANVAS_HISTORY_POSTGRES === "1";
let sqlite, pool, admin, schema;
const actor = { id: "owner", role: "operator", displayName: "Fixture" };
const adminActor = { ...actor, role: "admin" };
let maxReturned = 0;
let calls = 0;
const fromJson = (value) => typeof value === "string" ? JSON.parse(value) : value;

try {
  if (postgres) {
    assert(process.env.DATABASE_URL, "DATABASE_URL required for opt-in disposable PostgreSQL check");
    assert(["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL).hostname), "Loopback only");
    const { Pool } = await import("pg");
    schema = `canvas_history_${process.pid}_${Date.now()}`;
    admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, options: `-c search_path=${schema} -c statement_timeout=60000` });
  } else sqlite = new DatabaseSync(":memory:");
  const execute = async (sql, values = []) => postgres ? pool.query(sql, values) : sqlite.prepare(sql).run(...values);
  const query = async (sql, values = []) => {
    const rows = postgres ? (await pool.query(sql, values)).rows : sqlite.prepare(sql).all(...values);
    maxReturned = Math.max(maxReturned, rows.length);
    calls++;
    return rows;
  };
  const jsonType = postgres ? "JSONB" : "TEXT";
  const timeType = postgres ? "TIMESTAMPTZ" : "TEXT";
  await execute(`CREATE TABLE canvas_runs (id TEXT PRIMARY KEY, workflow_id TEXT, created_at ${timeType}, data_json ${jsonType})`);
  await execute(`CREATE TABLE canvas_node_runs (id TEXT PRIMARY KEY, run_id TEXT, node_id TEXT, status TEXT, attempt INTEGER, updated_at ${timeType}, data_json ${jsonType})`);
  await execute("CREATE INDEX history_run ON canvas_runs(workflow_id, created_at)");
  await execute("CREATE INDEX history_node ON canvas_node_runs(run_id, node_id)");
  const db = functions("src/lib/database.ts", ["readCanvasHistorySelection", "listCanvasNodeRunsForWorkflowFromDb", "listCanvasSuccessfulNodeRunsForWorkflowFromDb", "iterateCanvasSuccessfulNodeRunsForNodeFromDb"], {
    ensureDatabaseReady: async () => {}, getDatabaseBackend: () => postgres ? "postgres" : "sqlite",
    getPostgresPool: () => ({ query: async (sql, values) => ({ rows: await query(sql, values) }) }),
    getSqliteDatabase: () => ({ prepare: (sql) => ({ all: (...values) => {
      const rows = sqlite.prepare(sql).all(...values); maxReturned = Math.max(maxReturned, rows.length); calls++; return rows;
    } }) }),
    canvasHistoryQuery, canvasHistoryPageSize, fromJson,
  });
  const insert = async (id, options = {}) => {
    const at = options.at || "2026-01-01T00:00:00.000Z";
    const nodeId = options.nodeId || "node";
    const node = { id: nodeId, type: "model.fixture", version: 1, config: { text: options.text || "old" } };
    const run = { id: `run-${id}`, workflowId: options.workflowId || "fixture", ownerUserId: options.owner === null ? undefined : options.owner || "owner", createdAt: at, workflowRevision: 1,
      graphSnapshot: { nodes: options.missingNode ? [] : [node], edges: [] }, ...(options.iteration ? { iterationContext: { parentRunId: "parent" } } : {}) };
    const nodeRun = { id, runId: run.id, nodeId, status: options.status || "completed", attempt: options.attempt || 1, updatedAt: options.updatedAt || at,
      inputs: {}, outputs: options.empty ? {} : { text: { kind: "text", value: id } } };
    const marks = (n) => Array.from({ length: n }, (_, i) => postgres ? `$${i + 1}` : "?").join(",");
    await execute(`INSERT INTO canvas_runs VALUES (${marks(4)})`, [run.id, run.workflowId, at, JSON.stringify(run)]);
    await execute(`INSERT INTO canvas_node_runs VALUES (${marks(7)})`, [id, run.id, nodeId, nodeRun.status, nodeRun.attempt, nodeRun.updatedAt, JSON.stringify(nodeRun)]);
  };
  // Older compatible output is beyond two pages, including identical timestamps
  // and attempts. Newest records are inaccessible, empty, or nonprojectable.
  await insert("000-compatible");
  for (let i = 1; i <= 70; i++) await insert(String(i).padStart(3, "0"), { text: "different" });
  await insert("new-failed", { at: "2026-02-01T00:00:00.000Z", status: "failed", empty: true });
  await insert("new-empty", { at: "2026-02-02T00:00:00.000Z", empty: true });
  await insert("other", { at: "2026-03-01T00:00:00.000Z", owner: "other" });
  await insert("unowned", { at: "2026-03-02T00:00:00.000Z", owner: null });
  await insert("iteration", { at: "2026-04-01T00:00:00.000Z", iteration: true });
  await insert("missing", { at: "2026-04-02T00:00:00.000Z", missingNode: true });
  await insert("old-node", { nodeId: "old-node", at: "2025-01-01T00:00:00.000Z" });
  await insert("other-workflow", { workflowId: "different", at: "2026-05-01T00:00:00.000Z" });
  const ids = (rows) => rows.map((row) => row.nodeRun.id);
  assert.deepEqual(ids(await db.listCanvasNodeRunsForWorkflowFromDb("fixture", actor)), ["new-empty", "old-node"]);
  assert.deepEqual(ids(await db.listCanvasSuccessfulNodeRunsForWorkflowFromDb("fixture", actor)), ["070", "old-node"]);
  assert.deepEqual(ids(await db.listCanvasSuccessfulNodeRunsForWorkflowFromDb("fixture", adminActor)), ["unowned", "old-node"]);
  assert.deepEqual(await db.listCanvasNodeRunsForWorkflowFromDb("fixture", { ...actor, id: "no-access" }), []);
  assert.deepEqual(await db.listCanvasNodeRunsForWorkflowFromDb("absent", actor), []);
  await insert("order-new-run", { workflowId: "ordering", at: "2026-02-01T00:00:00.000Z", status: "partial" });
  await insert("order-old-run-new-attempt", { workflowId: "ordering", updatedAt: "2026-03-01T00:00:00.000Z", status: "failed", empty: true });
  await insert("order-reused", { workflowId: "ordering", nodeId: "reused", status: "reused" });
  await insert("order-bypassed", { workflowId: "ordering", nodeId: "bypassed", status: "bypassed" });
  assert.equal((await db.listCanvasNodeRunsForWorkflowFromDb("ordering", actor))[0].nodeRun.id, "order-old-run-new-attempt");
  assert.equal((await db.listCanvasSuccessfulNodeRunsForWorkflowFromDb("ordering", actor))[0].nodeRun.id, "order-new-run");
  assert.equal((await db.listCanvasSuccessfulNodeRunsForWorkflowFromDb("ordering", actor)).length, 3);
  calls = 0;
  const visited = [];
  for await (const item of db.iterateCanvasSuccessfulNodeRunsForNodeFromDb("fixture", "node", actor)) {
    visited.push(item.nodeRun.id);
    if (item.nodeRun.id === "000-compatible") break;
  }
  assert.equal(visited.length, 71);
  assert.equal(new Set(visited).size, 71, "keyset ties must neither skip nor repeat records");
  assert.equal(calls, 3);
  assert(maxReturned <= canvasHistoryPageSize);
  calls = 0;
  for await (const item of db.iterateCanvasSuccessfulNodeRunsForNodeFromDb("fixture", "node", actor)) { assert.equal(item.nodeRun.id, "070"); break; }
  assert.equal(calls, 1, "first compatible result must stop pagination");

  // The service must consume the bounded traversal and reuse an older compatible
  // result, not simply truncate history to the most recent result/page.
  const graph = { nodes: [{ id: "node", type: "model.fixture", version: 1, config: { text: "old" } }, { id: "target", type: "model.fixture", version: 1, config: {} }], edges: [] };
  const { resolveCanvasRunPlan, isReusableCandidate } = functions("src/lib/canvas/runs.ts", ["resolveCanvasRunPlan", "isReusableCandidate", "fingerprintCanvasNodeExecution", "normalizeFingerprintInputs", "stableSerialize", "incomingEdgeIdentity"], {
    createHash,
    buildCanvasRunPlan: () => ({ order: ["node", "target"], blockers: [], confirmationNodeIds: [] }),
    findNode: (nodes, id) => nodes.find((node) => node.id === id), getCanvasNodeDefinition: () => ({ label: "Fixture" }),
    collectInputs: () => ({}), getCanvasNodeExecutionMode: () => "enabled", missingRequiredInput: () => undefined,
    resolveCanvasLiteralOutputs: () => undefined, iterateCanvasSuccessfulNodeRunsForNodeFromDb: db.iterateCanvasSuccessfulNodeRunsForNodeFromDb,
    canAccessWorkspaceOwner: (account, owner) => owner === account.id,
  });
  const plan = await resolveCanvasRunPlan(graph, "fixture", ["target"], "isolated", actor);
  assert.equal(plan.steps[0].sourceNodeRunId, "000-compatible");
  assert.equal(plan.steps[0].action, "reuse");
  assert.equal(plan.steps[1].action, "execute");
  assert.deepEqual(plan.blockers, []);
  const reusable = (await db.listCanvasSuccessfulNodeRunsForWorkflowFromDb("fixture", actor))[0];
  const currentNode = graph.nodes[0];
  assert.equal(isReusableCandidate(graph, currentNode, {}, reusable.run, reusable.nodeRun), false, "newest result has incompatible config");
  const oldRun = { ...reusable.run, graphSnapshot: graph };
  assert.equal(isReusableCandidate(graph, currentNode, {}, oldRun, reusable.nodeRun), true);
  assert.equal(isReusableCandidate(graph, currentNode, {}, oldRun, { ...reusable.nodeRun, internalMetadata: { iteration: { downstreamStale: true } } }), false);
  assert.equal(isReusableCandidate(graph, { ...currentNode, version: 2 }, {}, oldRun, reusable.nodeRun), false);
  assert.equal(isReusableCandidate(graph, currentNode, {}, oldRun, { ...reusable.nodeRun, outputs: {} }), false);

  // 180k historical rows with repeated 16 KiB graphs would return >2.7 GiB
  // through the old join. New SQL only materializes 25 winners per selection.
  const runCount = 7200;
  const nodes = Array.from({ length: 25 }, (_, i) => ({ id: `scale-${i}`, type: "input.text", version: 1, config: {} }));
  const scaleRun = { id: "scale", ownerUserId: "owner", createdAt: "2026-01-01T00:00:00.000Z", graphSnapshot: { nodes, edges: [] }, padding: "x".repeat(16384) };
  const scaleNode = { id: "scale", nodeId: "scale", status: "completed", attempt: 1, outputs: { text: { kind: "text", value: "result" } } };
  if (postgres) {
    await execute(`INSERT INTO canvas_runs SELECT 'scale-run-'||i,'scale','2026-01-01T00:00:00.000Z', $1::jsonb || jsonb_build_object('id','scale-run-'||i) FROM generate_series(1,${runCount}) i`, [JSON.stringify(scaleRun)]);
    await execute(`INSERT INTO canvas_node_runs SELECT 'scale-node-'||i||'-'||j,'scale-run-'||i,'scale-'||j,'completed',1,'2026-01-01T00:00:00.000Z', $1::jsonb || jsonb_build_object('id','scale-node-'||i||'-'||j,'runId','scale-run-'||i,'nodeId','scale-'||j) FROM generate_series(1,${runCount}) i CROSS JOIN generate_series(0,24) j`, [JSON.stringify(scaleNode)]);
  } else {
    await execute(`WITH RECURSIVE seq(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM seq WHERE i<${runCount}) INSERT INTO canvas_runs SELECT 'scale-run-'||i,'scale','2026-01-01T00:00:00.000Z',json_set(?, '$.id','scale-run-'||i) FROM seq`, [JSON.stringify(scaleRun)]);
    await execute(`WITH RECURSIVE seq(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM seq WHERE i<${runCount}), nodes(j) AS (VALUES(0) UNION ALL SELECT j+1 FROM nodes WHERE j<24) INSERT INTO canvas_node_runs SELECT 'scale-node-'||i||'-'||j,'scale-run-'||i,'scale-'||j,'completed',1,'2026-01-01T00:00:00.000Z',json_set(?, '$.id','scale-node-'||i||'-'||j,'$.runId','scale-run-'||i,'$.nodeId','scale-'||j) FROM seq CROSS JOIN nodes`, [JSON.stringify(scaleNode)]);
  }
  maxReturned = 0;
  const start = performance.now();
  for (const select of [db.listCanvasNodeRunsForWorkflowFromDb, db.listCanvasSuccessfulNodeRunsForWorkflowFromDb]) {
    const rows = await select("scale", actor);
    assert.equal(rows.length, 25);
    assert.equal(new Set(rows.map((row) => row.nodeRun.nodeId)).size, 25);
    assert(Buffer.byteLength(JSON.stringify(rows)) < 1024 * 1024, "history result must stay below 1 MiB for this multi-GiB fixture");
  }
  assert.equal(maxReturned, 25);
  console.log(JSON.stringify({ backend: postgres ? "postgres" : "sqlite", historyRows: runCount * 25, returnedPerQuery: 25, selectionMs: Math.round(performance.now() - start), heapUsedMiB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) }));
  console.log("Canvas history permissions, latest/success, old outputs, bounded reuse and large-history checks passed.");
} finally {
  sqlite?.close();
  await pool?.end();
  if (admin) { try { await admin.query(`DROP SCHEMA ${schema} CASCADE`); } finally { await admin.end(); } }
}
