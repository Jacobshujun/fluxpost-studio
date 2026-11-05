import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

const read = (file) => readFileSync(file, "utf8");
function load(file, deps = {}) {
  const loaded = { exports: {} };
  const js = ts.transpileModule(read(file), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  Function("module", "exports", "require", js)(loaded, loaded.exports, (name) => { assert(name in deps, name); return deps[name]; });
  return loaded.exports;
}
function databaseFunctions(scope) {
  const file = "src/lib/database.ts";
  const names = ["queryCanvasScheduleSummariesFromDb", "putCanvasScheduleFavoriteInDb", "deleteCanvasScheduleFavoriteFromDb", "deleteCanvasScheduleFromDb"];
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
  const body = names.map((name) => ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(ast).replace(/^export /, "")).join("\n");
  const js = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return Function(...Object.keys(scope), `${js};return {${names.join(",")}}`)(...Object.values(scope));
}

const actor = { id: "operator", displayName: "Operator", role: "operator" };
const other = { ...actor, id: "other" };
const adminActor = { ...actor, id: "admin", role: "admin" };
const postgres = process.argv.includes("--postgres");
const temp = mkdtempSync(path.join(tmpdir(), "fluxpost-schedule-favorites-"));
let sqlite, pool, admin;
const schema = `schedule_favorites_${process.pid}_${Date.now()}`;
try {
  if (postgres) {
    assert(process.env.DATABASE_URL, "DATABASE_URL required for opt-in isolated PostgreSQL verification");
    assert(["127.0.0.1", "localhost", "[::1]"].includes(new URL(process.env.DATABASE_URL).hostname), "Loopback only");
    const { Pool } = await import("pg");
    admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, options: `-c search_path=${schema} -c statement_timeout=10000` });
  } else {
    sqlite = new DatabaseSync(path.join(temp, "fixture.db"));
    sqlite.exec("PRAGMA foreign_keys=ON");
  }
  const execute = async (sql, values = []) => postgres ? pool.query(sql, values) : sqlite.prepare(sql).run(...values.map((value) => typeof value === "boolean" ? Number(value) : value));
  const schemaSql = read("db/migrations/002_canvas_workflows.sql");
  const favoriteSchema = load("src/lib/canvas/schedule-favorite-schema.ts").canvasScheduleFavoriteSchemaSql;
  assert.equal(read("db/migrations/008_canvas_schedule_favorites.sql").replace(/\r\n/g, "\n").trim(), favoriteSchema.trim());
  if (postgres) { await pool.query(schemaSql); await pool.query(favoriteSchema); }
  else { sqlite.exec(schemaSql); sqlite.exec(favoriteSchema); }
  const queryModule = load("src/lib/canvas/schedule-list-query.ts");
  const db = databaseFunctions({
    ensureDatabaseReady: async () => {}, getDatabaseBackend: () => postgres ? "postgres" : "sqlite",
    getPostgresPool: () => pool, getSqliteDatabase: () => sqlite,
    canvasScheduleListSql: queryModule.canvasScheduleListSql,
  });
  const domain = load("src/lib/canvas/schedule-favorites.ts", { "../database": db });
  const marks = (count) => Array.from({ length: count }, (_, i) => postgres ? `$${i + 1}` : "?").join(",");
  const now = "2026-11-04T01:00:00.000Z";
  await execute(`INSERT INTO canvas_workflows VALUES (${marks(8)})`, ["flow", actor.id, "Daily Workflow", 1, false, now, now, "{}"]);
  await execute(`INSERT INTO canvas_workflows VALUES (${marks(8)})`, ["private-flow", other.id, "Hidden workflow", 1, false, now, now, "{}"]);
  for (let i = 0; i < 160; i++) {
    const owned = i < 110;
    const data = { id: `task-${i}`, name: i === 0 ? "Old 100%_! task" : `Task ${i}`, revision: 4, schemaVersion: i === 1 ? 1 : 2,
      totalMainTasks: 2, totalChildTasks: 8, totalContentTasks: 2, totalImageTasks: 8,
      definition: { parameters: [{ source: { values: ["private material"] } }] },
      mainTasks: [{ privateRuntime: "x".repeat(8000) }], workflowSnapshot: { privateGraph: true } };
    await execute(`INSERT INTO canvas_schedules VALUES (${marks(8)})`, [data.id, owned ? actor.id : other.id,
      i === 2 ? "missing-flow" : i === 3 ? "private-flow" : "flow", i === 0 ? "running" : "completed", 4, now,
      new Date(Date.parse(now) + i * 1000).toISOString(), JSON.stringify(data)]);
  }
  const list = (account, query = {}) => db.queryCanvasScheduleSummariesFromDb(account, { limit: 50, offset: 0, ...query });
  assert.equal((await list(actor)).total, 110, "scope must precede the old global 100-row cap");
  assert.equal((await list(other)).total, 50);
  assert.equal((await list(adminActor)).total, 160);
  const allIds = [];
  for (const offset of [0, 50, 100]) allIds.push(...(await list(actor, { offset })).schedules.map((item) => item.id));
  assert.equal(new Set(allIds).size, 110);
  const old = await list(actor, { q: "100%_!" });
  assert.deepEqual(old.schedules.map((item) => item.id), ["task-0"], "search must treat wildcard characters literally");
  assert(!("definition" in old.schedules[0]) && !("workflowSnapshot" in old.schedules[0]) && !("mainTasks" in old.schedules[0]));
  assert(Buffer.byteLength(JSON.stringify(old)) < 1200, "summaries must stay small despite large runtime payloads");
  const before = postgres ? (await pool.query("SELECT * FROM canvas_schedules WHERE id='task-0'")).rows[0] : sqlite.prepare("SELECT * FROM canvas_schedules WHERE id='task-0'").get();
  const favorite = await domain.saveCanvasScheduleFavorite(actor, "task-0", {});
  assert.equal(favorite.alias, "Old 100%_! task");
  await domain.saveCanvasScheduleFavorite(actor, "task-0", { alias: "G6 Daily", note: "Proven setup" });
  const renamed = (await list(actor, { q: "proven", favorite: true, workflowId: "flow" })).schedules[0];
  assert.equal(renamed.favorite.alias, "G6 Daily");
  assert.equal((await list(actor, { q: "daily workflow" })).total, 108);
  assert.equal((await list(actor, { favorite: true })).total, 1);
  assert.equal((await list(other, { favorite: true })).total, 0);
  await domain.saveCanvasScheduleFavorite(adminActor, "task-0", { alias: "Admin bookmark" });
  assert.equal((await list(adminActor, { favorite: true })).schedules[0].favorite.alias, "Admin bookmark");
  assert.equal((await list(actor, { favorite: true })).schedules[0].favorite.alias, "G6 Daily");
  await assert.rejects(domain.saveCanvasScheduleFavorite(other, "task-0", {}), (error) => error.status === 404);
  await assert.rejects(domain.removeCanvasScheduleFavorite(other, "task-0"), (error) => error.status === 404);
  for (const body of [{ alias: " " }, { alias: false }, { note: 1 }, { note: "a".repeat(1001) }]) {
    await assert.rejects(domain.saveCanvasScheduleFavorite(actor, "task-0", body), (error) => error.status === 400);
  }
  for (const params of ["limit=0", "limit=101", "offset=-1", "offset=1.1", "favorite=yes"]) {
    assert.throws(() => domain.parseCanvasScheduleListQuery(new URLSearchParams(params)), (error) => error.status === 400);
  }
  assert.deepEqual(domain.parseCanvasScheduleListQuery(new URLSearchParams()), { q: undefined, workflowId: undefined, favorite: false, limit: 50, offset: 0 });
  let routeActor = actor;
  let workerWakeups = 0;
  const signInError = new Error("Sign in required");
  const routeDeps = {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/canvas/schedule-favorites": domain,
    "@/lib/workspace-accounts": {
      requireWorkspaceAccount: async () => { if (!routeActor) throw signInError; return routeActor; },
      isWorkspaceSignInError: (error) => error === signInError,
    },
    "@/lib/database": db,
    "@/lib/canvas/schedule-response": { canvasScheduleResponse: (value) => value },
    "@/lib/canvas/scheduler": {
      listCanvasSchedules: async () => [], kickCanvasSchedulerWorker: () => { workerWakeups++; },
    },
  };
  const favoriteRoute = load("src/app/api/canvas/schedules/[id]/favorite/route.ts", routeDeps);
  const listRoute = load("src/app/api/canvas/schedules/route.ts", routeDeps);
  const context = (id) => ({ params: Promise.resolve({ id }) });
  const request = (method = "GET", body) => new Request("http://localhost/api/canvas/schedules/task-1/favorite", {
    method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
  assert.equal((await favoriteRoute.GET(request(), context("task-120"))).status, 404);
  assert.equal((await favoriteRoute.PUT(request("PUT", { alias: "Route alias", note: "Route note" }), context("task-1"))).status, 200);
  assert.equal((await (await favoriteRoute.GET(request(), context("task-1"))).json()).favorite.alias, "Route alias");
  assert.equal((await favoriteRoute.PUT(request("PUT", []), context("task-1"))).status, 400);
  assert.equal((await favoriteRoute.PUT(new Request("http://localhost", { method: "PUT", body: "{" }), context("task-1"))).status, 400);
  assert.equal((await favoriteRoute.DELETE(request("DELETE"), context("task-1"))).status, 200);
  assert.equal((await (await favoriteRoute.GET(request(), context("task-1"))).json()).favorite, null);
  const summaries = await listRoute.GET(new Request("http://localhost/api/canvas/schedules?view=summary&q=100%25_!"));
  assert.equal(summaries.status, 200);
  assert.equal((await summaries.json()).total, 1);
  assert.equal(workerWakeups, 0, "summary and favorite routes must not wake execution workers");
  assert.equal((await listRoute.GET(new Request("http://localhost/api/canvas/schedules?view=summary&limit=0"))).status, 400);
  routeActor = undefined;
  assert.equal((await favoriteRoute.GET(request(), context("task-1"))).status, 401);
  assert.equal((await favoriteRoute.PUT(request("PUT", {}), context("task-1"))).status, 401);
  assert.equal((await favoriteRoute.DELETE(request("DELETE"), context("task-1"))).status, 401);
  assert.equal((await listRoute.GET(new Request("http://localhost/api/canvas/schedules?view=summary"))).status, 401);
  routeActor = actor;
  const legacyList = await listRoute.GET(new Request("http://localhost/api/canvas/schedules"));
  assert.deepEqual(await legacyList.json(), { schedules: [] }, "default list response is backward-compatible");
  assert.equal(workerWakeups, 1);
  const after = postgres ? (await pool.query("SELECT * FROM canvas_schedules WHERE id='task-0'")).rows[0] : sqlite.prepare("SELECT * FROM canvas_schedules WHERE id='task-0'").get();
  assert.deepEqual(after, before, "bookmark writes must not conflict with scheduler revisions or execution");
  if (!postgres) {
    sqlite.close(); sqlite = new DatabaseSync(path.join(temp, "fixture.db")); sqlite.exec("PRAGMA foreign_keys=ON");
  }
  assert.equal((await list(actor, { favorite: true })).schedules[0].favorite.note, "Proven setup", "favorites persist across reopen");
  for (const id of ["task-2", "task-3"]) {
    await domain.saveCanvasScheduleFavorite(actor, id, {});
    const summary = (await list(actor, { scheduleId: id })).schedules[0];
    assert.equal(summary.workflowAvailable, false);
    assert.equal(summary.workflowName, undefined, "inaccessible workflow names must not leak");
    await domain.removeCanvasScheduleFavorite(actor, id);
  }
  await domain.removeCanvasScheduleFavorite(actor, "task-0");
  assert.equal((await list(actor, { favorite: true })).total, 0);
  assert.equal((await list(adminActor, { favorite: true })).total, 1);
  assert.equal(await db.deleteCanvasScheduleFromDb("task-0", actor.id), true);
  assert.equal((await list(adminActor, { favorite: true })).total, 0, "source deletion cascades all related bookmarks");
  await assert.rejects(domain.getCanvasScheduleFavoriteSummary(actor, "task-0"), (error) => error.status === 404);
  console.log(`Schedule favorites (${postgres ? "PostgreSQL" : "SQLite"}): 160-row scoped search/pagination, literal search, lightweight projections, personal/admin isolation, validation, persistence, revision independence and deletion passed.`);
} finally {
  sqlite?.close();
  await pool?.end();
  if (admin) { try { await admin.query(`DROP SCHEMA ${schema} CASCADE`); } finally { await admin.end(); } }
  rmSync(temp, { recursive: true, force: true });
}
