// Opt-in loopback test: only connection-local TEMP tables, no runtime initializer.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { Client } from "pg";
import ts from "typescript";
import type * as Database from "../../src/lib/database";
import type * as Library from "../../src/lib/library-assets";
import { emptyLibraryTagProfile } from "../../src/lib/library-tags";
import { libraryColorSchemaSql } from "../../src/lib/library-color-schema";
import type { LibraryAsset } from "../../src/lib/types";

async function main() {
  assert(process.env.DATABASE_URL);
  const url = new URL(process.env.DATABASE_URL);
  assert(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert(!url.searchParams.has("host") && !url.searchParams.has("hostaddr"));
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("SET search_path TO pg_temp");
    const schema = readFileSync("db/migrations/001_initial_postgres.sql", "utf8");
    const librarySchema = schema.slice(schema.indexOf("CREATE TABLE IF NOT EXISTS library_assets ("), schema.indexOf("CREATE TABLE IF NOT EXISTS copy_library_entries ("));
    assert(librarySchema.length > 1000);
    await client.query(librarySchema.replaceAll("CREATE TABLE IF NOT EXISTS", "CREATE TEMP TABLE"));
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
    const library = load("src/lib/library-assets.ts", { "./database": database }) as typeof Library;
    const actor = { id: "fixture-owner", displayName: "Fixture", role: "operator" as const };
    const other = { ...actor, id: "fixture-other" };
    const admin = { ...actor, role: "admin" as const };
    const tags = { ...emptyLibraryTagProfile(), customTags: ["retained"] };
    const now = "2026-10-27T00:00:00.000Z";
    for (const id of ["a", "b", "c"]) {
      const asset: LibraryAsset = { id, ownerUserId: id === "c" ? other.id : actor.id, ownerDisplayName: "Fixture", name: id, originalName: `${id}.png`, objectKey: `fixture/${id}`, publicUrl: `https://fixture.invalid/${id}`, mimeType: "image/png", extension: ".png", byteSize: 100, width: 10, height: 10, sha256: id.repeat(64), collectionIds: [], visibility: id === "b" ? "team" : "private", aiTags: tags, effectiveTags: tags, manualOverrides: {}, taggingStatus: "completed", cleanupStatus: "ready", createdAt: now, updatedAt: now };
      await database.saveLibraryAssetToDb(asset);
    }
    const collection = await library.createLibraryCollection(actor, { name: "Retained collection", visibility: "team" });
    await library.updateLibraryAssetCollections(actor, { action: "add_to_collections", selection: { mode: "ids", assetIds: ["a", "b"] }, collectionIds: [collection.id] });
    await library.setLibraryAssetFavorite(actor, "a", true);
    assert.equal((await library.listLibraryAssets(actor, {})).total, 2);
    assert.equal((await library.listLibraryAssets(other, {})).total, 2);
    assert.equal((await library.listLibraryAssets(admin, {})).total, 3);
    assert.equal((await library.listLibraryAssets(actor, { collectionId: collection.id })).total, 2);
    assert.equal((await library.listLibraryAssets(other, { collectionId: collection.id })).total, 1);
    const nav = await library.listLibraryNavigation(actor);
    assert.deepEqual(nav.counts, { all: 2, uncategorized: 0, favorites: 1 });
    assert.equal(nav.collections.length, 1);
    assert.equal((await library.getLibraryAsset(actor, "a")).id, "a");
    await assert.rejects(library.getLibraryAsset(other, "a"));
    assert((await library.listLibraryTagSuggestions(actor)).some((tag) => tag.label === "retained"));
    assert.equal((await client.query("SELECT to_regclass('generated_image_results') relation")).rows[0].relation, null);
    console.log("PostgreSQL ordinary library list/navigation/detail/collections/tags/favorites and ownership pass without generated tables.");
  } finally { await client.end(); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
