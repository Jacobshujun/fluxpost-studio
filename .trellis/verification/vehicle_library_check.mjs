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
const directAssetSaves = [];
const atomicAssetJobSaves = [];
let duplicateAsset;
let objectWrites = 0;
const assetModule = { exports: {} };
const assetRequire = (specifier) => {
  if (specifier === "./database") return {
    findLibraryAssetByOwnerHashFromDb: async () => duplicateAsset,
    findLibraryAssetByLegacyMaterialIdFromDb: async () => undefined,
    listLibraryCollectionsFromDb: async () => [],
    saveLibraryAssetToDb: async (asset) => { directAssetSaves.push(asset); return asset; },
    saveLibraryAssetAndTaggingJobToDb: async (asset, job) => { atomicAssetJobSaves.push({ asset, job }); return { asset, job }; },
  };
  if (specifier === "./library-image") return { readLibraryImageDimensions: () => ({ width: 1, height: 1 }) };
  if (specifier === "./library-tags") return tagModule.exports;
  if (specifier === "./material-library") return { listMaterialLibrary: async () => ({ folders: [], assets: [] }) };
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
const { importLibraryAsset } = assetModule.exports;

const actor = { id: "vehicle-owner", displayName: "Vehicle Owner" };
const vehicleImport = await importLibraryAsset(actor, {
  bytes: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
  originalName: "vehicle.jpg",
  role: "vehicle",
});
assert(vehicleImport.status === "imported", "A new pure vehicle image must import successfully.");
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
assert(objectWrites === 1, "Cross-role reuse must not persist a second image object.");

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
contains(home, /href="\/library\?role=reference"[\s\S]*href="\/library\?role=vehicle"/, "Home must expose direct entries for both libraries.");
contains(config, /"参考图库打标模型"[\s\S]*"仅用于参考图库的后台视觉打标/, "Library model configuration must describe reference-only tagging.");

console.log("Vehicle library manual-tag, no-AI import, role reuse, URL, and UI contract check ok");
