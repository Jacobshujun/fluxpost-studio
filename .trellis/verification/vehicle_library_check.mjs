import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const read = (file) => {
  const absolute = path.join(root, file);
  if (!existsSync(absolute)) throw new Error(`Missing file: ${file}`);
  return readFileSync(absolute, "utf8");
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const contains = (value, pattern, message) => assert(pattern.test(value), message);

const tags = read("src/lib/library-tags.ts");
const assets = read("src/lib/library-assets.ts");
const sortSource = read("src/lib/library-sort.ts");
const tagging = read("src/lib/library-tagging.ts");
const tagRoute = read("src/app/api/library/tags/route.ts");
const assetRoute = read("src/app/api/library/assets/[id]/route.ts");
const importRoute = read("src/app/api/library/import/route.ts");
const page = read("src/app/library/page.tsx");
const home = read("src/app/page.tsx");
const config = read("src/lib/config.ts");

const compiledTags = ts.transpileModule(tags, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: "library-tags.ts",
}).outputText;
const tagModule = { exports: {} };
new Function("exports", "module", compiledTags)(tagModule.exports, tagModule);
const {
  getLibraryTagProfileForRole,
  getLibraryUnifiedTagsForRole,
  mergeLibraryTagProfile,
} = tagModule.exports;

const compiledAssets = ts.transpileModule(assets, {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: "library-assets.ts",
}).outputText;
const nativeRequire = createRequire(import.meta.url);
const compiledSort = ts.transpileModule(sortSource, {
  compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: "library-sort.ts",
}).outputText;
const sortModule = { exports: {} };
new Function("exports", "module", "require", compiledSort)(sortModule.exports, sortModule, nativeRequire);
const directAssetSaves = [];
const atomicAssetJobSaves = [];
let assetsInDb = [];
let duplicateAsset;
let objectWrites = 0;
const assetModule = { exports: {} };
const assetRequire = (specifier) => {
  if (specifier === "./database") return {
    findLibraryAssetByOwnerHashFromDb: async () => duplicateAsset,
    listLibraryAssetsFromDb: async () => assetsInDb,
    listLibraryCollectionsFromDb: async () => [],
    saveLibraryAssetToDb: async (asset) => { directAssetSaves.push(asset); return asset; },
    saveLibraryAssetAndTaggingJobToDb: async (asset, job) => { atomicAssetJobSaves.push({ asset, job }); return { asset, job }; },
  };
  if (specifier === "./library-image") return { readLibraryImageDimensions: () => ({ width: 1, height: 1 }) };
  if (specifier === "./library-tags") return tagModule.exports;
  if (specifier === "./library-sort") return sortModule.exports;
  if (specifier === "./runtime-media-storage") return {
    deleteRuntimeMediaObject: async () => undefined,
    persistLibraryObject: async ({ publicPath }) => { objectWrites += 1; return { objectKey: publicPath, publicUrl: publicPath }; },
  };
  if (specifier === "./workspace-ownership") return {
    isWorkspaceAdmin: () => false,
    scopeWorkspaceOwner: (account) => ({ ownerUserId: account.id, ownerDisplayName: account.displayName || account.id }),
  };
  return nativeRequire(specifier);
};
new Function("exports", "module", "require", compiledAssets)(assetModule.exports, assetModule, assetRequire);
const { importLibraryAsset, listLibraryAssets, parseLibraryAssetFilters, resolveLibraryAssetSelections } = assetModule.exports;

const actor = { id: "vehicle-owner", displayName: "Vehicle Owner" };
const vehicleImport = await importLibraryAsset(actor, {
  bytes: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
  originalName: "vehicle.jpg",
  role: "vehicle",
});
assert(vehicleImport.status === "imported", "A new pure vehicle image must import successfully.");
assert(vehicleImport.asset.visibility === "team", "A new image import must default to team visibility.");
assert(directAssetSaves.length === 1, "A pure vehicle import must persist exactly one asset.");
assert(atomicAssetJobSaves.length === 0 && !("job" in vehicleImport), "A pure vehicle import must not persist or return a tagging job.");
assert(objectWrites === 1, "A new pure vehicle import must persist one image object.");

duplicateAsset = directAssetSaves[0];
const duplicateVehicleImport = await importLibraryAsset(actor, {
  bytes: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
  originalName: "vehicle-copy.jpg",
  role: "vehicle",
});
assert(duplicateVehicleImport.status === "skipped_duplicate", "A same-role duplicate vehicle import must be skipped.");
assert(directAssetSaves.length === 1 && atomicAssetJobSaves.length === 0 && objectWrites === 1, "A same-role duplicate must not write another asset, job, or object.");

const referenceReuse = await importLibraryAsset(actor, {
  bytes: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
  originalName: "reference-copy.jpg",
  role: "reference",
});
assert(referenceReuse.status === "imported", "A cross-role duplicate must reuse the canonical asset.");
assert(atomicAssetJobSaves.length === 1 && referenceReuse.job, "Adding the reference role must atomically persist its tagging job.");
assert(referenceReuse.asset.roles.includes("vehicle") && referenceReuse.asset.roles.includes("reference"), "Cross-role reuse must retain both library roles.");
assert(referenceReuse.asset.visibility === "team", "Cross-role reuse must preserve the canonical asset visibility.");
assert(objectWrites === 1, "Cross-role reuse must not persist a second image object.");

duplicateAsset = undefined;
const privateImport = await importLibraryAsset(actor, {
  bytes: Buffer.from([0xff, 0xd8, 0xff, 0x01]),
  originalName: "private-vehicle.jpg",
  role: "vehicle",
  visibility: "private",
});
assert(privateImport.asset.visibility === "private", "An explicit private image import must remain private.");

const emptyTags = tagModule.exports.emptyLibraryTagProfile();
const makeAsset = ({ id, name, ownerDisplayName, createdAt }) => ({
  id,
  ownerUserId: actor.id,
  ownerDisplayName,
  name,
  originalName: `${name}.jpg`,
  objectKey: `library/${id}.jpg`,
  publicUrl: `/library/${id}.jpg`,
  mimeType: "image/jpeg",
  extension: ".jpg",
  byteSize: 4,
  sha256: id.padEnd(64, "0"),
  roles: ["vehicle"],
  collectionIds: [],
  visibility: "team",
  aiTags: emptyTags,
  manualOverrides: {},
  effectiveTags: emptyTags,
  taggingStatus: "completed",
  cleanupStatus: "ready",
  createdAt,
  updatedAt: createdAt,
});
assetsInDb = [
  makeAsset({ id: "asset-alpha", name: "Alpha", ownerDisplayName: "张三", createdAt: "2026-01-02T00:00:00.000Z" }),
  makeAsset({ id: "asset-beta", name: "Beta", ownerDisplayName: "李四", createdAt: "2026-01-01T00:00:00.000Z" }),
  makeAsset({ id: "asset-gamma", name: "Gamma", ownerDisplayName: "王五", createdAt: "2026-01-03T00:00:00.000Z" }),
];
const resolvedVehicleAssets = await resolveLibraryAssetSelections(actor, ["asset-beta", "asset-alpha", "asset-beta"], "vehicle");
assert(JSON.stringify(resolvedVehicleAssets.map((asset) => asset.id)) === JSON.stringify(["asset-beta", "asset-alpha"]), "Vehicle selection resolution must preserve submitted order and remove duplicate ids.");
assetsInDb.push(
  { ...makeAsset({ id: "asset-private", name: "Private", ownerDisplayName: "Other", createdAt: "2026-01-04T00:00:00.000Z" }), ownerUserId: "other-owner", visibility: "private" },
  { ...makeAsset({ id: "asset-reference", name: "Reference", ownerDisplayName: "Vehicle Owner", createdAt: "2026-01-05T00:00:00.000Z" }), roles: ["reference"] },
);
for (const assetId of ["asset-private", "asset-reference", "asset-missing"]) {
  let rejected = false;
  try {
    await resolveLibraryAssetSelections(actor, [assetId], "vehicle");
  } catch (error) {
    rejected = /not accessible/.test(String(error));
  }
  assert(rejected, `Vehicle selection resolution must reject inaccessible or non-vehicle id: ${assetId}`);
}
let rejectedInvalidId = false;
try {
  await resolveLibraryAssetSelections(actor, [123], "vehicle");
} catch (error) {
  rejectedInvalidId = /must be a string/.test(String(error));
}
assert(rejectedInvalidId, "Vehicle selection resolution must reject non-string ids explicitly.");
assetsInDb = assetsInDb.slice(0, 3);
const sortedNames = async (sort) => (await listLibraryAssets(actor, { sort, limit: 10 })).assets.map((asset) => asset.name);
assert(JSON.stringify(await sortedNames("newest")) === JSON.stringify(["Gamma", "Alpha", "Beta"]), "Newest image sorting is incorrect.");
assert(JSON.stringify(await sortedNames("oldest")) === JSON.stringify(["Beta", "Alpha", "Gamma"]), "Oldest image sorting is incorrect.");
assert(JSON.stringify(await sortedNames("name-asc")) === JSON.stringify(["Alpha", "Beta", "Gamma"]), "Ascending image-name sorting is incorrect.");
assert(JSON.stringify(await sortedNames("name-desc")) === JSON.stringify(["Gamma", "Beta", "Alpha"]), "Descending image-name sorting is incorrect.");
assert(JSON.stringify(await sortedNames("owner-asc")) === JSON.stringify(["Beta", "Gamma", "Alpha"]), "Ascending submitter sorting is incorrect.");
assert(JSON.stringify(await sortedNames("owner-desc")) === JSON.stringify(["Alpha", "Gamma", "Beta"]), "Descending submitter sorting is incorrect.");

const firstOwnerPage = await listLibraryAssets(actor, { sort: "owner-asc", limit: 2 });
const secondOwnerPage = await listLibraryAssets(actor, { sort: "owner-asc", limit: 2, cursor: firstOwnerPage.nextCursor });
assert(JSON.stringify([...firstOwnerPage.assets, ...secondOwnerPage.assets].map((asset) => asset.name)) === JSON.stringify(["Beta", "Gamma", "Alpha"]), "Sorted image cursor pagination must not skip or duplicate assets.");
let rejectedMismatchedCursor = false;
try {
  await listLibraryAssets(actor, { sort: "owner-desc", limit: 2, cursor: firstOwnerPage.nextCursor });
} catch (error) {
  rejectedMismatchedCursor = /Invalid library cursor/.test(String(error));
}
assert(rejectedMismatchedCursor, "A cursor from another sort order must be rejected.");
assert(parseLibraryAssetFilters(new URL("http://local/api/library/assets?sort=owner-desc")).sort === "owner-desc", "Image sort query parsing is missing.");
assert(parseLibraryAssetFilters(new URL("http://local/api/library/assets?sort=bad")).sort === "newest", "Invalid image sort values must use the default.");

const aiTags = {
  imageType: "exterior",
  scenes: ["城市道路"],
  vehicleModels: ["AI 车型"],
  vehicleColors: [],
  angles: ["front"],
  people: "no",
  customTags: ["AI 标签"],
};
const manualOverrides = { vehicleModels: ["小鹏 G6"], customTags: ["白色"] };
const dualRoleAsset = {
  aiTags,
  manualOverrides,
  effectiveTags: mergeLibraryTagProfile(aiTags, manualOverrides),
};
const referenceLabels = getLibraryUnifiedTagsForRole(dualRoleAsset, "reference").map((tag) => tag.label);
const vehicleTags = getLibraryUnifiedTagsForRole(dualRoleAsset, "vehicle");
const vehicleLabels = vehicleTags.map((tag) => tag.label);
assert(referenceLabels.includes("城市道路") && referenceLabels.includes("小鹏 G6"), "Reference projection must retain AI and manual labels.");
assert(vehicleLabels.includes("小鹏 G6") && vehicleLabels.includes("白色"), "Vehicle projection must retain structured and free-form manual labels.");
assert(!vehicleLabels.includes("城市道路") && !vehicleLabels.includes("正前") && !vehicleLabels.includes("无人物"), "Vehicle projection must exclude every AI-only dimension.");
assert(vehicleTags.every((tag) => tag.source === "manual"), "Every vehicle tag must be marked as manual.");
assert(getLibraryTagProfileForRole(dualRoleAsset, "vehicle").model === undefined, "Vehicle projection must not expose AI metadata.");

contains(assets, /taggingStatus: role === "reference" \? "queued" : "completed"/, "Pure vehicle imports must use a neutral completed status.");
contains(assets, /const job = role === "reference" \? makeLibraryTaggingJob\(asset, now\) : undefined;[\s\S]*if \(job\) await saveLibraryAssetAndTaggingJobToDb\(asset, job\);[\s\S]*else await saveLibraryAssetToDb\(asset\);/, "Pure vehicle imports must persist without a tagging job.");
contains(assets, /duplicate\?\.roles\.includes\(role\)[\s\S]*reuseLibraryAssetForRole\(account, duplicate, role/, "Cross-library duplicate imports must reuse the existing asset and add the target role.");
contains(assets, /referenceAdded[\s\S]*saveLibraryAssetAndTaggingJobToDb\(queued, job\)/, "Adding a reference role must atomically create a tagging job.");
contains(assets, /getLibraryTagProfileForRole\(asset, filters\.role\)/, "Asset queries must use role-aware tag profiles.");
contains(assets, /getLibraryUnifiedTagLabelsForRole\(asset, filters\.role\)/, "Tag suggestions must use role-aware label projection.");
contains(assets, /effectiveTags: getLibraryTagProfileForRole\(asset, role\)/, "Tag mutations must use the selected role profile.");
contains(assets, /!asset\.roles\.includes\(role\)[\s\S]*selected library/, "Tag mutations must reject assets outside the selected role.");

const referenceGuards = tagging.match(/roles\.includes\("reference"\)/g) || [];
assert(referenceGuards.length >= 5, "Tag enqueue, model execution, writeback, and failure paths must all guard the reference role.");
contains(tagging, /if \(!eligible\.roles\.includes\("reference"\)\)[\s\S]*callTaggingModel/, "The worker must recheck reference eligibility immediately before the model call.");
contains(tagging, /callTaggingModel[\s\S]*if \(!current\.roles\.includes\("reference"\)\)[\s\S]*saveLibraryAssetToDb/, "The worker must recheck reference eligibility before writing AI labels.");
contains(assetRoute, /taggingQueued[\s\S]*kickLibraryTaggingWorker/, "Adding a reference role through the asset route must wake the worker.");
contains(importRoute, /"job" in result && result\.job[\s\S]*kickLibraryTaggingWorker/, "Imports must wake the tagging worker only when a reference job was persisted.");
contains(importRoute, /stringValue\(form\.get\("visibility"\)\) \|\| "team"/, "Image import API must default to team visibility.");
assert(!/result\.status === "imported"[\s\S]*kickLibraryTaggingWorker/.test(importRoute), "Pure vehicle imports must not wake the tagging worker.");
contains(tagRoute, /role: requireLibraryRole\(body\.role\)/, "Tag mutation API must require an explicit library role.");

contains(page, /writeLibraryRoleToUrl\(nextRole, "push"\)/, "Library tabs must write role changes to browser history.");
contains(page, /addEventListener\("popstate", applyUrlRole\)/, "Library view must respond to browser back and forward navigation.");
contains(page, /role !== "reference"\) return;[\s\S]*setInterval/, "Vehicle view must not start tagging polling.");
contains(page, /getLibraryUnifiedTagsForRole\(asset, activeRole\)/, "Cards and editors must render shared role-aware tag projection.");
contains(page, /activeRole === "reference" \? <TaggingBadge/, "Vehicle cards and preview must hide tagging badges.");
contains(page, /activeRole === "reference" && hasOverrides[\s\S]*恢复 AI 标签/, "Vehicle tag editor must hide Restore AI.");
contains(page, /role === "reference" \? "已上传，等待自动打标" : "已导入车型图库"/, "Vehicle import success copy must not mention automatic tagging.");
contains(page, /role: activeRole, assetIds: \[asset\.id\]/, "Single vehicle tag mutations must carry the active role.");
contains(page, /role, assetIds: \[\.\.\.selected\]/, "Batch vehicle tag mutations must carry the active role.");
contains(page, /const \[activeIndex, setActiveIndex\] = useState\(-1\)/, "Tag suggestions must not be selected before explicit keyboard navigation.");
contains(page, /event\.key === "Enter"[\s\S]*commit\(activeIndex >= 0 \? options\[activeIndex\]\?\.label \|\| draft : draft\)/, "Enter must preserve a newly typed prefix tag instead of replacing it with the first longer suggestion.");
contains(page, /onChange=\{\(event\) => \{ setDraft\(event\.target\.value\); setActiveIndex\(-1\)/, "Editing a tag must clear any previous suggestion selection.");
contains(home, /href="\/library\?role=reference"[\s\S]*href="\/library\?role=vehicle"/, "Home must expose direct entries for both libraries.");
contains(config, /"参考图库打标模型"[\s\S]*"仅用于参考图库的后台视觉打标/, "Library model configuration must describe reference-only tagging.");

console.log("Vehicle library manual-tag, no-AI import, role reuse, URL, and UI contract check ok");
