import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

const migrationPath = "db/migrations/007_content_pool_collections.sql";
assert.equal(existsSync(path.join(root, migrationPath)), true, "content-pool collections migration must exist");
const databaseSource = read("src/lib/database.ts");
const migrationSource = read(migrationPath);
const collectionsSource = read("src/lib/content-pool-collections.ts");
const contentPoolSource = read("src/lib/content-pool.ts");
const tagsSource = read("src/lib/content-pool-tags.ts");
const selectionSource = read("src/lib/content-pool-selection.ts");

for (const table of ["content_pool_collections", "content_pool_collection_items", "content_pool_tags"]) {
  const ddl = `CREATE TABLE IF NOT EXISTS ${table}`;
  assert.equal(databaseSource.split(ddl).length - 1, 2, `${table} must exist in both SQLite and PostgreSQL DDL blocks`);
  assert.equal(migrationSource.includes(ddl), true, `${table} must exist in the additive PostgreSQL migration`);
}
for (const index of [
  "idx_content_pool_collections_owner_parent",
  "idx_content_pool_collections_owner_path",
  "idx_content_pool_collection_items_item",
  "idx_content_pool_tags_owner_key",
]) {
  assert.equal(databaseSource.includes(`CREATE INDEX IF NOT EXISTS ${index}`), true, `missing runtime index ${index}`);
  assert.equal(migrationSource.includes(`CREATE INDEX IF NOT EXISTS ${index}`), true, `missing migration index ${index}`);
}
assert.match(databaseSource, /export async function mutateAllSourceProjectsInDb/, "tag rename/delete must update changed project rows in one transaction");
assert.match(databaseSource, /export async function deleteContentPoolCollectionItemsForItemsFromDb/, "item deletion must be able to clean memberships");
assert.match(collectionsSource, /parentId === collectionId/, "collection move must reject self-parenting");
assert.match(collectionsSource, /contentPoolCollectionDescendantIds\(collections, collectionId\)\.includes\(parentId\)/, "collection move must reject descendant cycles");
assert.match(collectionsSource, /request\.action === "move_to_default"/, "membership batch must support moving items back to the default library");
assert.match(collectionsSource, /createdCollection = await createContentPoolCollection\(account/, "membership batch must support creating a collection and adding items");
assert.match(collectionsSource, /renameContentPoolTag/, "tag rename domain must exist");
assert.match(collectionsSource, /deleteContentPoolTag/, "tag delete domain must exist");
assert.match(contentPoolSource, /memberships:\s*visibleMemberships/, "snapshot must expose collection memberships");
assert.match(contentPoolSource, /deleteContentPoolCollectionItemsForItemsFromDb\(deletedItems\)/, "single and batch item deletion must clean memberships");
assert.match(contentPoolSource, /requireContentPoolCollectionWriteTarget/, "ingest targets must be validated before writing");
assert.match(tagsSource, /contentPoolTagColorValues/, "tag colors must use the shared palette");
assert.match(tagsSource, /normalizeContentPoolTagColor/, "tag colors must be validated");
assert.match(selectionSource, /includeDescendants:\s*input\.includeDescendants !== false/, "selection filter must default to including descendants");

const fixture = mkdtempSync(path.join(os.tmpdir(), "fluxpost-content-pool-collections-"));
try {
  const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", ".trellis/verification/content_pool_collections_worker.ts"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: "", FLUXPOST_CONTENT_POOL_FIXTURE: fixture },
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`${result.stdout || ""}${result.stderr || ""}`.trim());
  process.stdout.write(result.stdout);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
