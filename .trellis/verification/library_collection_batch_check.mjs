import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const source = read("src/lib/library-assets.ts");
const compiled = ts.transpileModule(source, {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: "library-assets.ts",
}).outputText;
const nativeRequire = createRequire(import.meta.url);
const emptyTags = { scenes: [], vehicleModels: [], vehicleColors: [], angles: [], people: "unknown", customTags: [] };
const collections = [
  { id: "legacy", ownerUserId: "owner-1", ownerDisplayName: "Owner One", role: "reference", name: "Legacy", relativePath: "Legacy", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  { id: "c1", ownerUserId: "owner-1", ownerDisplayName: "Owner One", role: "reference", name: "Campaign", relativePath: "Campaign", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  { id: "c2", ownerUserId: "owner-1", ownerDisplayName: "Owner One", role: "reference", name: "Detail", relativePath: "Campaign/Detail", parentId: "c1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  { id: "vehicle-c", ownerUserId: "owner-1", ownerDisplayName: "Owner One", role: "vehicle", name: "Vehicle", relativePath: "Vehicle", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  { id: "other-c", ownerUserId: "owner-2", ownerDisplayName: "Owner Two", role: "reference", name: "Other", relativePath: "Other", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
];
const makeAsset = (id, ownerUserId = "owner-1", roles = ["reference"], collectionIds = []) => ({
  id,
  ownerUserId,
  ownerDisplayName: ownerUserId === "owner-1" ? "Owner One" : "Owner Two",
  name: id,
  originalName: `${id}.jpg`,
  objectKey: `library/${id}.jpg`,
  publicUrl: `/library/${id}.jpg`,
  mimeType: "image/jpeg",
  extension: ".jpg",
  byteSize: 4,
  sha256: id.padEnd(64, "0"),
  roles,
  roleAddedAt: Object.fromEntries(roles.map((role) => [role, "2026-01-01T00:00:00.000Z"])),
  collectionIds,
  visibility: "team",
  aiTags: emptyTags,
  manualOverrides: {},
  effectiveTags: emptyTags,
  taggingStatus: "completed",
  cleanupStatus: "ready",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});
const assets = new Map([
  ["own-a", makeAsset("own-a", "owner-1", ["reference"], ["legacy"])],
  ["own-b", makeAsset("own-b", "owner-1", ["reference"], ["c1", "c2"])],
  ["own-c", makeAsset("own-c", "owner-1", ["reference"], ["legacy"])],
  ["readonly", makeAsset("readonly", "owner-2")],
  ["wrong-role", makeAsset("wrong-role", "owner-1", ["vehicle"])],
  ["admin-asset", makeAsset("admin-asset", "owner-2")],
]);
const saves = [];
const collectionSaves = [];
const assetModule = { exports: {} };
const localRequire = (specifier) => {
  if (specifier === "./database") return {
    getLibraryAssetFromDb: async (id) => assets.get(id),
    listLibraryAssetsFromDb: async () => [...assets.values()],
    listLibraryCollectionsFromDb: async () => collections,
    saveLibraryAssetToDb: async (asset) => { assets.set(asset.id, asset); saves.push(asset); return asset; },
    saveLibraryCollectionToDb: async (collection) => { collections.push(collection); collectionSaves.push(collection); return collection; },
  };
  if (specifier === "./library-image") return { readLibraryImageDimensions: () => ({}) };
  if (specifier === "./library-tags") return {
    applyLibraryTagChanges: () => ({}),
    emptyLibraryTagProfile: () => emptyTags,
    getLibraryTagProfileForRole: (asset) => asset.effectiveTags,
    getLibraryUnifiedTagLabels: () => [],
    getLibraryUnifiedTagLabelsForRole: () => [],
    matchesAllLibraryTags: () => true,
    mergeLibraryTagProfile: (aiTags) => aiTags,
    normalizeLibraryTagKey: (value) => value,
    normalizeLibraryManualOverrides: (value) => value,
    normalizeStringList: (values = []) => [...new Set(values)],
  };
  if (specifier === "./library-sort") return {
    compareLibraryText: (left, right) => left.localeCompare(right),
    getLibraryAssetAddedAt: (asset) => asset.createdAt,
    libraryListSortDirection: () => 1,
    normalizeLibraryListSort: () => "newest",
  };
  if (specifier === "./runtime-media-storage") return { deleteRuntimeMediaObject: async () => undefined, persistLibraryObject: async () => ({}) };
  if (specifier === "./workspace-ownership") return {
    isWorkspaceAdmin: (account) => account.role === "admin",
    scopeWorkspaceOwner: (account) => ({ ownerUserId: account.id, ownerDisplayName: account.displayName || account.id }),
  };
  return nativeRequire(specifier);
};
new Function("exports", "module", "require", compiled)(assetModule.exports, assetModule, localRequire);
const { updateLibraryAssetCollections } = assetModule.exports;
const member = { id: "owner-1", displayName: "Owner One", role: "operator" };

for (const [collectionIds, message] of [
  [["missing-c"], "Missing target collections must fail before asset writes."],
  [["vehicle-c"], "Wrong-role target collections must fail before asset writes."],
  [["other-c"], "Member-inaccessible target collections must fail before asset writes."],
]) {
  const before = saves.length;
  let rejected = false;
  try {
    await updateLibraryAssetCollections(member, { action: "add_to_collections", role: "reference", assetIds: ["own-a"], collectionIds });
  } catch { rejected = true; }
  assert(rejected && saves.length === before, message);
}

const added = await updateLibraryAssetCollections(member, {
  action: "add_to_collections",
  role: "reference",
  assetIds: ["own-a", "own-b", "readonly", "wrong-role", "missing", "own-a"],
  collectionIds: ["c1", "c2", "c1"],
});
assert(added.assets.length === 1 && added.assets[0].id === "own-a", "Only the editable changed asset should be returned.");
assert(JSON.stringify(added.assets[0].collectionIds) === JSON.stringify(["legacy", "c1", "c2"]), "Add must preserve old relationships and append a stable target union.");
assert(JSON.stringify(added.unchangedAssetIds) === JSON.stringify(["own-b"]), "Already-classified assets must be returned as unchanged.");
assert(added.failures.length === 3, "Read-only, wrong-role, and missing assets must fail independently.");
assert(added.failures.some((failure) => failure.assetId === "readonly" && /read-only/.test(failure.error)), "Read-only failures must be distinguishable in UI feedback.");
const savesAfterAdd = saves.length;
const repeated = await updateLibraryAssetCollections(member, { action: "add_to_collections", role: "reference", assetIds: ["own-a", "own-b"], collectionIds: ["c1", "c2"] });
assert(repeated.assets.length === 0 && repeated.unchangedAssetIds.length === 2 && saves.length === savesAfterAdd, "Repeated add must be idempotent and write nothing.");

const removed = await updateLibraryAssetCollections(member, { action: "remove_from_collection", role: "reference", assetIds: ["own-a", "own-b", "own-c"], collectionId: "c1" });
assert(removed.assets.length === 2 && removed.unchangedAssetIds[0] === "own-c", "Remove must update members and report existing non-members unchanged.");
assert(assets.get("own-a").collectionIds.includes("legacy") && assets.get("own-a").collectionIds.includes("c2"), "Remove must delete only the requested collection relationship.");

const created = await updateLibraryAssetCollections(member, { action: "create_collection_and_add", role: "reference", assetIds: ["own-c"], name: "Summer", parentId: "c1" });
assert(created.collection?.relativePath === "Campaign/Summer" && created.assets[0].collectionIds.includes(created.collection.id), "Create-and-add must create at the current hierarchy and immediately add assets.");
const collectionCount = collections.length;
const reused = await updateLibraryAssetCollections(member, { action: "create_collection_and_add", role: "reference", assetIds: ["own-c"], name: "Summer", parentId: "c1" });
assert(collections.length === collectionCount && reused.collection?.id === created.collection.id && reused.unchangedAssetIds[0] === "own-c", "Create-and-add must reuse an existing same-path collection idempotently.");

const admin = { id: "admin-1", displayName: "Admin", role: "admin" };
const adminAdded = await updateLibraryAssetCollections(admin, { action: "add_to_collections", role: "reference", assetIds: ["admin-asset"], collectionIds: ["other-c"] });
assert(adminAdded.assets.length === 1, "Admins must retain cross-owner asset and collection management.");
const adminChild = await updateLibraryAssetCollections(admin, { action: "create_collection_and_add", role: "reference", assetIds: ["admin-asset"], name: "Admin Child", parentId: "other-c" });
assert(adminChild.collection?.ownerUserId === "owner-2", "Admin-created child collections must remain in the parent owner's hierarchy.");

await updateLibraryAssetCollections(admin, { action: "add_to_collections", role: "reference", assetIds: ["own-c"], collectionIds: ["other-c"] });
const ownerAfterAdmin = await updateLibraryAssetCollections(member, { action: "add_to_collections", role: "reference", assetIds: ["own-c"], collectionIds: ["c1"] });
assert(ownerAfterAdmin.assets.length === 1 && ownerAfterAdmin.assets[0].collectionIds.includes("other-c") && ownerAfterAdmin.assets[0].collectionIds.includes("c1"), "Owners must be able to add a manageable target while preserving collection relationships previously assigned by an admin.");

const manyMissingIds = Array.from({ length: 101 }, (_, index) => `missing-${index}`);
const large = await updateLibraryAssetCollections(member, { action: "add_to_collections", role: "reference", assetIds: manyMissingIds, collectionIds: ["c1"] });
assert(large.failures.length === 101, "Batch asset ids must not be silently truncated at 100 entries.");

let rejectedNonString = false;
try {
  await updateLibraryAssetCollections(member, { action: "add_to_collections", role: "reference", assetIds: [123], collectionIds: ["c1"] });
} catch (error) { rejectedNonString = /must be a string/.test(String(error)); }
assert(rejectedNonString, "Non-string batch ids must be rejected explicitly.");

console.log("Library batch collection validation, idempotency, permissions, hierarchy, and no-truncation check ok");
