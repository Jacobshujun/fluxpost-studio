// Opt-in: uses connection-local TEMP tables only, never runtime rows or initialization.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { Pool } from "pg";
import ts from "typescript";
import { libraryColorSchemaSql } from "../../src/lib/library-color-schema";
import { libraryColorVersion } from "../../src/lib/library-color";
import type * as Database from "../../src/lib/database";
import type * as Store from "../../src/lib/library-color-store";

async function main() {
  assert(process.env.DATABASE_URL, "Explicit loopback DATABASE_URL required");
  assert(["127.0.0.1", "localhost", "[::1]"].includes(new URL(process.env.DATABASE_URL).hostname));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    await client.query(`CREATE TEMP TABLE library_assets(id TEXT PRIMARY KEY,owner_user_id TEXT,visibility TEXT,sha256 TEXT,
      name TEXT,original_name TEXT,note TEXT,mime_type TEXT,width INTEGER,height INTEGER,byte_size INTEGER,
      tagging_status TEXT,cleanup_status TEXT,created_at TEXT,updated_at TEXT,deleted_at TEXT,data_json JSONB,search_vector TSVECTOR);
      CREATE TEMP TABLE library_collection_assets(collection_id TEXT,asset_id TEXT);
      CREATE TEMP TABLE library_asset_favorites(owner_user_id TEXT,asset_id TEXT);
      CREATE TEMP TABLE library_asset_labels(asset_id TEXT,dimension TEXT,value TEXT);`);
    await client.query(libraryColorSchemaSql.replaceAll("CREATE TABLE IF NOT EXISTS", "CREATE TEMP TABLE"));
    const require = createRequire(path.resolve("src/lib/database.ts"));
    function load(file: string, overrides: Record<string, unknown>, append = "") {
      const output = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
      const mod = { exports: {} };
      Function("require", "module", "exports", output + append)((name: string) => overrides[name] || require(name), mod, mod.exports);
      return mod.exports;
    }
    const database = load("src/lib/database.ts", {}, "\nmodule.exports.bindFixture = p => { postgresPool=p; initializationBackend='postgres'; initializationPromise=Promise.resolve(); };\n") as typeof Database & { bindFixture: (value: unknown) => void };
    database.bindFixture({ query: client.query.bind(client), connect: async () => ({ query: client.query.bind(client), release: () => undefined }) });
    const store = load("src/lib/library-color-store.ts", { "./database": database }) as typeof Store;
    const actor = { id: "fixture-owner", displayName: "Fixture", role: "operator" as const };
    const other = { ...actor, id: "private-other" };
    for (let i = 0; i < 29; i++) {
      const id = `fixture-${i}`; const owner = i === 28 ? other.id : actor.id;
      const asset = { id, ownerUserId: owner, name: id, sha256: id, createdAt: "2026-10-19T00:00:00Z" };
      await client.query("INSERT INTO library_assets(id,owner_user_id,visibility,sha256,name,original_name,note,created_at,data_json) VALUES($1,$2,'private',$1,$1,$1,'',$3,$4)", [id, owner, asset.createdAt, asset]);
      if (i < 27 || i === 28) await store.saveLibraryPalette(id, { status: "completed", sha256: id, version: libraryColorVersion, analyzedAt: asset.createdAt, colors: [{ hex: "#3876C7", coverage: 1 }] });
    }
    const first = await database.queryLibraryAssetsFromDb({ actorId: actor.id, isAdmin: false, filters: { color: "#3876C7", limit: 24 } });
    assert.equal(first.total, 27); assert.equal(first.assets.length, 24); assert(first.hasMore);
    const last = first.assets.at(-1)!;
    const next = await database.queryLibraryAssetsFromDb({ actorId: actor.id, isAdmin: false, filters: { color: "#3876C7", limit: 24 }, cursor: { id: last.id, value: last.createdAt } });
    assert.equal(next.assets.length, 3); assert(!next.assets.some((a) => first.assets.some((b) => a.id === b.id)));
    assert.equal((await database.queryLibraryAssetIdsFromDb({ actorId: actor.id, isAdmin: false, filters: { color: "#3876C7" } })).length, 27);
    assert.equal((await database.queryLibraryAssetsFromDb({ actorId: actor.id, isAdmin: false, filters: { color: "#D43C3C" } })).total, 0);
    const job = await store.enqueueLibraryColorJob(actor, "missing");
    assert.equal(await store.enqueueLibraryColorJob(actor, "missing"), job);
    assert.equal((await store.getLibraryColorJob(actor))?.id, job);
    assert.equal((await store.libraryColorCoverage(actor)).manageableMissing, 1);
    assert.equal(await store.getLibraryColorJob(other, job), undefined);
    const claim = await store.claimLibraryColorItem(); assert(claim);
    await client.query("UPDATE library_assets SET name='preserved' WHERE id=$1", [claim.assetId]);
    assert(await store.completeLibraryColorItem(claim, { status: "completed", sha256: claim.sha256, version: libraryColorVersion, analyzedAt: new Date().toISOString(), colors: [{ hex: "#D43C3C", coverage: 1 }] }));
    assert.equal((await client.query("SELECT name FROM library_assets WHERE id=$1", [claim.assetId])).rows[0].name, "preserved");
    assert.equal((await store.getLibraryColorJob(actor, job))?.completed, 1);
    assert.equal((await store.libraryColorCoverage(actor)).manageableMissing, 0);
    console.log("Library colors PostgreSQL: TEMP-only schema, Lab filtering/counts/cursors/ownership, palette writes and durable job claims passed.");
  } finally { client.release(); await pool.end(); }
}
void main();
