import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";

const temp = mkdtempSync(path.join(tmpdir(), "fluxpost-batch-reads-"));
let closeDatabase = async () => {};
try {
  const modulePath = path.join(temp, "query.cjs");
  writeFileSync(modulePath, ts.transpileModule(readFileSync("src/lib/content-pool-read-query.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText);
  const { contentPoolReadQuery } = createRequire(import.meta.url)(modulePath);
  const postgres = process.argv.includes("--postgres");
  const backend = postgres ? "postgres" : "sqlite";
  let execute;
  if (postgres) {
    const url = new URL(process.env.DATABASE_URL || "");
    assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "PostgreSQL fixture requires loopback");
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: url.toString(), application_name: "fluxpost-batch-read-fixture" });
    await client.connect();
    closeDatabase = async () => { await client.query("ROLLBACK"); await client.end(); };
    await client.query("BEGIN");
    await client.query("SET LOCAL search_path=pg_temp; SET LOCAL statement_timeout='20s'");
    execute = async (sql, values = []) => (await client.query(sql, values)).rows;
  } else {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(":memory:");
    closeDatabase = async () => db.close();
    execute = async (sql, values = []) => db.prepare(sql).all(...values);
  }
  await execute(`CREATE ${postgres ? "TEMP " : ""}TABLE content_projects (
    id TEXT PRIMARY KEY, query TEXT, normalized_query TEXT, updated_at TEXT,
    last_crawled_at TEXT, created_at TEXT, data_json ${postgres ? "JSONB" : "TEXT"})`);
  const items = Array.from({ length: 205 }, (_, index) => ({
    id: `item-${index}`, ownerUserId: "a", title: `Title ${index}`, contentText: "Body",
    sourceId: `source-${index}`, platform: "xiaohongshu", images: [], downloadedImages: [],
    customTags: ["tag"], manualEditedFields: ["images"], publishedLabel: "昨天",
    raw: { create_time: 123, large: "raw-payload".repeat(1024) },
    analysis: { unused: "analysis".repeat(1024) }, visualTagging: { unused: "visual".repeat(1024) },
  }));
  const timestamp = "2026-11-16T00:00:00.000Z";
  for (const [id, owner, sourceItems] of [["project-a", "a", items], ["project-b", "b", [{ ...items[0], ownerUserId: "b", title: "Other owner" }]], ["legacy", undefined, [{ ...items[1], ownerUserId: undefined }]]]) {
    const project = { ownerUserId: owner, items: sourceItems };
    const placeholders = postgres ? "$1,$2,$3,$4,$5,$6,$7::jsonb" : "?,?,?,?,?,?,?";
    await execute(`INSERT INTO content_projects VALUES (${placeholders})`, [id, id, id, timestamp, timestamp, timestamp, JSON.stringify(project)]);
  }
  const query = async (input) => {
    const { sql, values } = contentPoolReadQuery({ backend, ...input });
    assert.doesNotMatch(sql, /data_json\s*@>|enable_seqscan/, "Batch reads must not issue per-ID containment probes or tune the planner");
    return (await execute(sql, values)).map((row) => ({ ...row, item: typeof row.item === "string" ? JSON.parse(row.item) : row.item }));
  };
  const compact = await query({ projection: "selection", ownerUserId: "a" });
  assert.equal(compact.length, 205);
  assert.equal(compact[0].owner_user_id, "a");
  assert.deepEqual(compact[0].item.customTags, ["tag"]);
  assert.deepEqual(compact[0].item.manualEditedFields, ["images"]);
  assert.equal(compact[0].item.publishedLabel, "昨天");
  assert.equal(compact[0].item.raw, undefined);
  assert.equal(compact[0].item.analysis, undefined);
  assert.equal(compact[0].item.visualTagging, undefined);
  for (const count of [50, 95, 200]) {
    const selected = await query({ projection: "items", ownerUserId: "a", itemIds: items.slice(0, count).map((item) => item.id) });
    assert.equal(selected.length, count);
    const byId = new Map(selected.map((row) => [row.item.id, row.item]));
    for (const item of items.slice(0, count)) assert.deepEqual(byId.get(item.id), item, "Only requested complete items may be returned");
  }
  assert.equal((await query({ projection: "items", ownerUserId: "a", itemIds: [] })).length, 0);
  assert.equal((await query({ projection: "items", ownerUserId: "a", itemIds: ["missing"] })).length, 0);
  assert.equal((await query({ projection: "items", ownerUserId: "a", projectId: "project-b", itemIds: ["item-0"] })).length, 0);
  assert.equal((await query({ projection: "items", itemIds: ["item-0"] })).length, 2, "Admin lookup must retain duplicate project candidates");
  assert.equal((await query({ projection: "items", itemIds: ["item-1"] })).length, 2, "Admin lookup must retain unowned legacy items");
  assert.equal((await query({ projection: "items", projectId: "project-b", itemIds: ["item-0"] }))[0].item.title, "Other owner");
  assert.equal((await query({ projection: "items", ownerUserId: "a", itemIds: ["' OR true --"] })).length, 0, "IDs must remain bound data");
  console.log(`Content-pool batch reads (${backend}): compact projection, 50/95/200 complete-item batches, ownership, legacy/duplicate IDs and project identity passed.`);
} finally {
  await closeDatabase();
  rmSync(temp, { recursive: true, force: true });
}
