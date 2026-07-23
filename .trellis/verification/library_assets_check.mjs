import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => {
  const absolute = path.join(root, file);
  if (!existsSync(absolute)) throw new Error(`Missing file: ${file}`);
  return readFileSync(absolute, "utf8");
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const contains = (value, pattern, message) => assert(pattern.test(value), message);

const types = read("src/lib/types.ts");
const database = read("src/lib/database.ts");
const postgres = read("db/migrations/001_initial_postgres.sql");
const assets = read("src/lib/library-assets.ts");
const tagging = read("src/lib/library-tagging.ts");
const tags = read("src/lib/library-tags.ts");
const storage = read("src/lib/runtime-media-storage.ts");
const page = read("src/app/library/page.tsx");
const css = read("src/app/library/library.module.css");
const home = read("src/app/page.tsx");

for (const name of ["LibraryAsset", "LibraryCollection", "LibraryTagProfile", "LibraryTaggingJob", "LibraryTagSuggestion", "LibraryTagBatchResult", "ReferenceAssetSelection"]) {
  contains(types, new RegExp(`export type ${name}\\b`), `Missing shared type ${name}.`);
}
for (const table of ["library_assets", "library_asset_roles", "library_collections", "library_collection_assets", "library_asset_labels", "library_tagging_jobs"]) {
  contains(database, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), `SQLite schema missing ${table}.`);
  contains(postgres, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), `PostgreSQL schema missing ${table}.`);
}
contains(assets, /findLibraryAssetByOwnerHashFromDb\(owner\.id, sha256\)[\s\S]*skipped_duplicate/, "Imports must deduplicate by owner and SHA-256.");
contains(assets, /Image exceeds the 30 MB limit/, "Import size limit is missing.");
contains(assets, /detectImageFormat\(input\.bytes\)/, "Imports must inspect file headers.");
contains(assets, /const job = role === "reference" \? makeLibraryTaggingJob\(asset, now\) : undefined;[\s\S]*if \(job\) await saveLibraryAssetAndTaggingJobToDb\(asset, job\)/, "Reference imports must atomically create their tagging job.");
contains(storage, /Library imports require fully configured TOS object storage/, "Library imports must not fall back to local storage.");
contains(storage, /ensureVerifiedTosObject\([\s\S]*contentLength: input\.body\.length/, "Library upload must use verified PUT/HEAD storage.");
contains(assets, /asset\.ownerUserId === account\.id \|\| asset\.visibility === "team"/, "Team read visibility is missing.");
contains(assets, /isWorkspaceAdmin\(account\) \|\| asset\.ownerUserId === account\.id/, "Owner/admin edit authorization is missing.");
contains(tags, /Object\.prototype\.hasOwnProperty\.call\(overrides, key\)/, "Manual empty overrides must remain distinguishable from AI values.");
contains(tags, /getLibraryUnifiedTags[\s\S]*normalizeLibraryTagKey[\s\S]*sources\.set/, "Unified tag projection and same-label deduplication are missing.");
contains(tags, /applyLibraryTagChanges[\s\S]*removeKeys[\s\S]*overrides\[dimension\] = null[\s\S]*overrides\[dimension\] = values/, "Removing a unified tag must persist structured manual overrides.");
contains(tags, /matchesAllLibraryTags[\s\S]*\.every\(/, "Unified tag filters must use AND semantics.");
contains(tags, /tags\.people === "yes"[\s\S]*tags\.people === "no"/, "Known people states must project to unified labels.");
contains(tagging, /job\.attempts < job\.maxAttempts/, "Tagging retry attempts must be bounded.");
contains(tagging, /isTransientTaggingError/, "Transient tagging failures must be classified.");
contains(tagging, /mergeLibraryTagProfile\(aiTags, current\.manualOverrides\)/, "Retagging must preserve manual overrides.");
contains(assets, /cleanupStatus: "failed"/, "Object cleanup failures must remain visible.");

const routeFiles = [
  "src/app/api/library/assets/route.ts",
  "src/app/api/library/assets/[id]/route.ts",
  "src/app/api/library/import/route.ts",
  "src/app/api/library/collections/route.ts",
  "src/app/api/library/collections/[collectionId]/assets/[assetId]/route.ts",
  "src/app/api/library/tagging/route.ts",
  "src/app/api/library/tagging/jobs/route.ts",
  "src/app/api/library/migrate/route.ts",
  "src/app/api/library/tags/route.ts",
];
for (const route of routeFiles) contains(read(route), /requireWorkspaceAccount\(request\)/, `${route} must require authentication.`);

for (const key of ["ArrowLeft", "ArrowRight", 'event.key === "+"', 'event.key === "-"', 'event.key === "0"', 'event.key === "1"', 'event.key === "Delete"', 'event.key === "Backspace"', 'event.key === "Escape"']) {
  assert(page.includes(key), `Preview keyboard contract missing ${key}.`);
}
contains(page, /function handlePreviewKeyDown[\s\S]*event\.key === "Tab"[\s\S]*focusable/, "Preview must trap keyboard focus.");
contains(page, /\[fitScale, \.25, \.5, \.75, 1, 1\.5, 2, 3, 4, 6, 8\]/, "Preview must expose zoom up to 800 percent.");
contains(page, /startDistance[\s\S]*pointers\.current\.size === 2/, "Preview pinch zoom is missing.");
contains(page, /deleteMode === "permanent"/, "Preview two-level deletion is missing.");
contains(page, /webkitdirectory/, "Folder import is missing.");
contains(page, /clipboardData/, "Clipboard import is missing.");
contains(page, /new IntersectionObserver[\s\S]*rootMargin: "500px 0px"/, "Asset pagination must prefetch near the grid boundary.");
contains(page, /loadMorePromiseRef\.current[\s\S]*return loadMorePromiseRef\.current/, "Grid and preview pagination must share concurrent cursor requests.");
contains(page, /setDetailId\(\(value\)[\s\S]*\}, \[queryString\]\);/, "Opening a detail panel must not reset cursor pagination.");
contains(page, /targetCount = Math\.max\(libraryPageSize, data\.assets\.length\)[\s\S]*while \(cursor && refreshed\.length < targetCount\)/, "Tagging polling must preserve the loaded page depth.");
contains(page, /index < assets\.length - 8[\s\S]*onLoadMore\(\)[\s\S]*nextAssets\.filter/, "Preview navigation must extend its sequence near the loaded boundary.");
contains(css, /\.loadMore\{[^}]*justify-content:center/, "Pagination fallback control styling is missing.");
contains(css, /prefers-reduced-motion:reduce/, "Reduced motion support is missing.");
contains(assets, /tags\?: string\[\][\s\S]*matchesAllLibraryTags\(tagProfile, filters\.tags\)/, "Asset listing must support repeated unified tag filters.");
contains(assets, /tags: list\("tag"\)/, "Repeated tag query parsing is missing.");
for (const legacyFilter of ["imageType", "scene", "vehicleModel", "vehicleColor", "angle", "people", "customTag"]) {
  assert(assets.includes(`list("${legacyFilter}")`), `Legacy dimension filter ${legacyFilter} must remain compatible.`);
}
contains(assets, /listLibraryTagSuggestions[\s\S]*canReadAsset\(account, asset\)[\s\S]*asset\.roles\.includes\(filters\.role\)/, "Tag suggestions must respect visibility and library role.");
contains(assets, /updateLibraryAssetTags[\s\S]*requireEditableAsset\(account, assetId\)[\s\S]*failures\.push/, "Batch tag updates must return per-asset permission failures.");
contains(page, /role="combobox"[\s\S]*aria-autocomplete="list"[\s\S]*aria-activedescendant/, "Unified tag picker must expose combobox semantics.");
for (const key of ["ArrowDown", "ArrowUp", "Enter", "Escape", "Backspace"]) assert(page.includes(`event.key === "${key}"`), `Tag combobox keyboard contract missing ${key}.`);
contains(page, /filterTags\.forEach\(\(tag\) => params\.append\("tag", tag\)\)/, "Library UI must submit repeated unified tag filters.");
contains(page, /BatchTagManager[\s\S]*只读团队资产会跳过/, "Batch tag management and read-only feedback are missing.");
contains(page, /restoreAi: manualTagKeys/, "Restore AI must clear every manual tag override.");
contains(page, /role: activeRole, assetIds: \[asset\.id\]/, "Single-asset tag changes must carry the active library role.");
contains(page, /role, assetIds: \[\.\.\.selected\]/, "Batch tag changes must carry the active library role.");
contains(page, /getStoredTheme[\s\S]*setStoredTheme[\s\S]*themeOptions/, "Library theme switcher is not synchronized with global theme storage.");
contains(css, /--library-bg:var\(--background\)/, "Library surfaces must use global theme variables.");
contains(css, /\.previewStage\{[^}]*background:#0d1013/, "Preview image stage must remain neutral dark.");
contains(css, /\.previewInfo\{background:var\(--library-panel\)/, "Preview details must follow the active theme.");
contains(home, /href="\/library\?role=reference"/, "Content desk reference-library entry is missing.");

console.log("Reference library assets, unified tags, themes, permissions, and preview contract check ok");
