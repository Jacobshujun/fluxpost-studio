import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

async function main() {
const root = process.env.FLUXPOST_UNIFIED_LIBRARY_FIXTURE;
if (!root) throw new Error("FLUXPOST_UNIFIED_LIBRARY_FIXTURE is required.");
mkdirSync(path.join(root, "data"), { recursive: true });
const file = path.join(root, "data", "fluxpost.db");
const fixture = new DatabaseSync(file);
fixture.exec(`
  PRAGMA foreign_keys=ON;
  CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE library_assets (
    id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, visibility TEXT NOT NULL, sha256 TEXT NOT NULL,
    object_key TEXT NOT NULL UNIQUE, public_url TEXT NOT NULL, tagging_status TEXT NOT NULL,
    cleanup_status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
    data_json TEXT NOT NULL, UNIQUE(owner_user_id, sha256)
  );
  CREATE TABLE library_asset_roles (asset_id TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY(asset_id, role));
  CREATE INDEX idx_library_asset_roles_role ON library_asset_roles(role, asset_id);
  CREATE TABLE library_collections (
    id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, role TEXT NOT NULL, parent_id TEXT, name TEXT NOT NULL,
    relative_path TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, data_json TEXT NOT NULL
  );
  CREATE INDEX idx_library_collections_owner_role ON library_collections(owner_user_id, role, parent_id, name);
  CREATE TABLE library_collection_assets (collection_id TEXT NOT NULL, asset_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(collection_id, asset_id));
  CREATE TABLE library_asset_labels (asset_id TEXT NOT NULL, dimension TEXT NOT NULL, value TEXT NOT NULL, source TEXT NOT NULL, confidence REAL, updated_at TEXT NOT NULL, PRIMARY KEY(asset_id, dimension, value));
  CREATE TABLE library_tagging_jobs (id TEXT PRIMARY KEY, asset_id TEXT NOT NULL, owner_user_id TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL, max_attempts INTEGER NOT NULL, run_after TEXT NOT NULL, locked_by TEXT, locked_until TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, started_at TEXT, completed_at TEXT, error TEXT, data_json TEXT NOT NULL);
  CREATE TABLE canvas_workflows (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, name TEXT NOT NULL, revision INTEGER NOT NULL, is_template INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, data_json TEXT NOT NULL);
  CREATE TABLE canvas_schedules (id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, workflow_id TEXT NOT NULL, status TEXT NOT NULL, revision INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, data_json TEXT NOT NULL);
`);

const now = "2026-08-28T00:00:00.000Z";
const profile = { imageType: "exterior", scenes: ["城市"], vehicleModels: [], vehicleColors: [], angles: [], people: "no", customTags: ["夜景"] };
function asset(id: string, ownerUserId: string, visibility: "private" | "team", createdAt: string) {
  return {
    id, ownerUserId, ownerDisplayName: ownerUserId, name: id, originalName: `${id}.jpg`, objectKey: `library/${id}.jpg`,
    publicUrl: `/library/${id}.jpg`, mimeType: "image/jpeg", extension: ".jpg", byteSize: 100, width: 100, height: 80,
    sha256: `${id}-sha`, collectionIds: [], visibility, roles: ["vehicle"], roleAddedAt: { vehicle: createdAt }, aiTags: profile,
    manualOverrides: {}, effectiveTags: profile, taggingStatus: "completed", cleanupStatus: "ready", createdAt, updatedAt: createdAt,
  };
}
const insertAsset = fixture.prepare("INSERT INTO library_assets VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
for (const item of [asset("a-1", "owner-a", "private", now), asset("a-2", "owner-a", "private", "2026-08-27T00:00:00.000Z"), asset("b-1", "owner-b", "private", now)]) {
  insertAsset.run(item.id, item.ownerUserId, item.visibility, item.sha256, item.objectKey, item.publicUrl, item.taggingStatus, item.cleanupStatus, item.createdAt, item.updatedAt, null, JSON.stringify(item));
}
const insertRole = fixture.prepare("INSERT INTO library_asset_roles VALUES (?,?)");
for (const id of ["a-1", "a-2", "b-1"]) insertRole.run(id, "vehicle");
const collection = { id: "legacy-child", ownerUserId: "owner-a", ownerDisplayName: "owner-a", role: "vehicle", name: "轿车", relativePath: "轿车", createdAt: now, updatedAt: now };
fixture.prepare("INSERT INTO library_collections VALUES (?,?,?,?,?,?,?,?,?)").run(collection.id, collection.ownerUserId, collection.role, null, collection.name, collection.relativePath, now, now, JSON.stringify(collection));
fixture.prepare("INSERT INTO library_collection_assets VALUES (?,?,?)").run("legacy-child", "a-1", now);
const canvas = { id: "workflow-1", ownerUserId: "owner-a", name: "legacy", revision: 1, graph: { nodes: [{ id: "node-1", config: { source: { mode: "library-filter", role: "vehicle", filter: { mode: "random", assetIds: [], search: "", tags: [] } } } }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, isTemplate: false, createdAt: now, updatedAt: now };
fixture.prepare("INSERT INTO canvas_workflows VALUES (?,?,?,?,?,?,?,?)").run(canvas.id, canvas.ownerUserId, canvas.name, 1, 0, now, now, JSON.stringify(canvas));
fixture.close();

process.chdir(root);
const database = await import("../../src/lib/database.ts");
const library = await import("../../src/lib/library-assets.ts");
const actor = { id: "owner-a", displayName: "Owner A", role: "operator" as const };
const collections = await database.listLibraryCollectionsFromDb();
const vehicleRoot = collections.find((item) => item.ownerUserId === actor.id && item.name === "车型库" && !item.parentId);
assert(vehicleRoot, "Owner A vehicle root was not created.");
assert(collections.find((item) => item.id === "legacy-child")?.parentId === vehicleRoot.id, "Legacy child hierarchy was not retained.");
const rootPage = await library.listLibraryAssets(actor, { collectionId: vehicleRoot.id, limit: 100 });
assert(rootPage.assets.length === 2 && rootPage.assets.every((item) => item.ownerUserId === actor.id), "Role membership migration crossed owner boundaries.");
assert(!("roles" in rootPage.assets[0]) && !("roleAddedAt" in rootPage.assets[0]), "Legacy role fields leaked from migrated assets.");
const tagPage = await library.listLibraryAssets(actor, { tags: ["夜景", "外观"], limit: 100 });
assert(tagPage.total === 2, "Unified tag AND query did not match migrated owner assets.");
await library.setLibraryAssetFavorite(actor, "a-1", true);
assert((await library.listLibraryAssets(actor, { favorite: true })).assets[0]?.id === "a-1", "Per-user favorite query failed.");
const smartCases = [
  { name: "tag-contains", field: "tag", operator: "contains", value: "夜景", total: 2 },
  { name: "tag-not-contains", field: "tag", operator: "not_contains", value: "不存在", total: 2 },
  { name: "collection", field: "collection", operator: "contains", value: vehicleRoot.id, total: 2 },
  { name: "text", field: "text", operator: "contains", value: "a-1", total: 1 },
  { name: "owner", field: "owner", operator: "equals", value: actor.id, total: 2 },
  { name: "visibility", field: "visibility", operator: "equals", value: "private", total: 2 },
  { name: "image-type", field: "imageType", operator: "equals", value: "exterior", total: 2 },
  { name: "width", field: "width", operator: "gte", value: 100, total: 2 },
  { name: "height", field: "height", operator: "lte", value: 80, total: 2 },
  { name: "byte-size", field: "byteSize", operator: "gte", value: 100, total: 2 },
  { name: "created-at", field: "createdAt", operator: "after", value: "2026-08-27T12:00:00.000Z", total: 1 },
  { name: "tagging-status", field: "taggingStatus", operator: "equals", value: "completed", total: 2 },
  { name: "favorite", field: "favorite", operator: "is", value: true, total: 1 },
] as const;
for (const testCase of smartCases) {
  const folder = await library.createLibrarySmartFolder(actor, {
    name: testCase.name,
    visibility: "private",
    match: "all",
    conditions: [{ id: testCase.name, field: testCase.field, operator: testCase.operator, value: testCase.value }],
  });
  const page = await library.listLibraryAssets(actor, { smartFolderId: folder.id, limit: 100 });
  assert(page.total === testCase.total, `Smart-folder ${testCase.name} expected ${testCase.total}, received ${page.total}.`);
}
const allFolder = await library.createLibrarySmartFolder(actor, {
  name: "all-match", visibility: "private", match: "all",
  conditions: [
    { id: "tag", field: "tag", operator: "contains", value: "夜景" },
    { id: "text", field: "text", operator: "contains", value: "a-1" },
  ],
});
assert((await library.listLibraryAssets(actor, { smartFolderId: allFolder.id })).total === 1, "Smart-folder all matching failed.");
const teamFolder = await library.createLibrarySmartFolder(actor, {
  name: "any-team", visibility: "team", match: "any",
  conditions: [
    { id: "one", field: "text", operator: "contains", value: "a-1" },
    { id: "two", field: "text", operator: "contains", value: "a-2" },
  ],
});
assert((await library.listLibraryAssets(actor, { smartFolderId: teamFolder.id })).total === 2, "Smart-folder any matching failed.");
const otherActor = { id: "owner-b", displayName: "Owner B", role: "operator" as const };
assert((await library.listLibrarySmartFolders(otherActor)).find((item) => item.id === teamFolder.id)?.canEdit === false, "Team smart folders must be visible but read-only to other members.");
let readOnlyRejected = false;
try { await library.updateLibrarySmartFolder(otherActor, teamFolder.id, { name: "not-allowed" }); } catch { readOnlyRejected = true; }
assert(readOnlyRejected, "Another member edited a team smart folder.");
const first = await library.listLibraryAssets(actor, { sort: "newest", limit: 1 });
assert(first.nextCursor, "Keyset cursor was not returned.");
const second = await library.listLibraryAssets(actor, { sort: "newest", limit: 1, cursor: first.nextCursor });
assert(second.assets.length === 1 && second.assets[0].id !== first.assets[0].id, `Keyset cursor repeated an asset: ${first.assets[0]?.id} -> ${second.assets[0]?.id}.`);
let rejected = false;
try { library.parseLibraryAssetFilters(new URL("http://local/api/library/assets?role=vehicle")); } catch { rejected = true; }
assert(rejected, "Public role filter was not rejected.");
const migrated = new DatabaseSync(file, { readOnly: true });
const workflow = JSON.parse(String((migrated.prepare("SELECT data_json FROM canvas_workflows WHERE id='workflow-1'").get() as { data_json: string }).data_json));
const source = workflow.graph.nodes[0].config.source;
assert(!("role" in source) && source.filter.collectionId === vehicleRoot.id && source.filter.includeDescendants === true, "Legacy Canvas source was not migrated to the root collection.");
assert(!(migrated.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='library_asset_roles'").get()), "Legacy role table still exists.");
assert((migrated.prepare("SELECT value FROM app_meta WHERE key=?").get(`unified_library_root:${actor.id}:vehicle`) as { value: string }).value === vehicleRoot.id, "Migration root metadata is missing.");
migrated.close();
console.log("Unified library SQLite migration and query runtime check passed.");
}

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
void main().catch((error) => { console.error(error); process.exitCode = 1; });
