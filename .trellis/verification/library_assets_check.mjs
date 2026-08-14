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
const sort = read("src/lib/library-sort.ts");
const tagging = read("src/lib/library-tagging.ts");
const tags = read("src/lib/library-tags.ts");
const storage = read("src/lib/runtime-media-storage.ts");
const page = read("src/app/library/page.tsx");
const importRoute = read("src/app/api/library/import/route.ts");
const css = read("src/app/library/library.module.css");
const home = read("src/app/page.tsx");

const importAssetStart = assets.indexOf("export async function importLibraryAsset");
const importAssetEnd = assets.indexOf("export async function patchLibraryAsset", importAssetStart);
assert(importAssetStart >= 0 && importAssetEnd > importAssetStart, "Library import implementation contract is missing.");
const importAssetContract = assets.slice(importAssetStart, importAssetEnd);

for (const name of ["LibraryAsset", "LibraryCollection", "LibraryListSort", "LibraryTagProfile", "LibraryTaggingJob", "LibraryTagSuggestion", "LibraryTagBatchResult", "ReferenceAssetSelection"]) {
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
contains(types, /WorkspaceAccountRole = "admin" \| "operator"/, "Workspace operator role contract is missing.");
contains(importRoute, /const account = await requireWorkspaceAccount\(request\)[\s\S]*importLibraryAsset\(account, \{/, "Signed-in operators must reach the library import service as the current account.");
assert(!/\bowner\s*:/.test(importRoute), "Browser imports must not accept an owner override.");
contains(importAssetContract, /const owner = input\.owner \|\| \{ id: account\.id, displayName: account\.displayName \|\| account\.id \}/, "Normal imports must default ownership to the signed-in account.");
contains(importAssetContract, /ownerUserId: owner\.id[\s\S]*return \{ status: "imported" as const, asset: \{ \.\.\.asset, canEdit: true \}/, "Imported assets must belong to the current owner and remain editable.");
assert(!/isWorkspaceAdmin\(/.test(importAssetContract), "Library imports must not require an administrator role.");
contains(importAssetContract, /input\.collectionId[\s\S]*validateCollectionIds\(account, \[input\.collectionId\], \[role\]\)/, "Imports into collections must retain owner-scoped validation.");
contains(assets, /validateCollectionIds[\s\S]*!isWorkspaceAdmin\(account\) && collection\.ownerUserId !== account\.id/, "Operators must not import into another owner's collection.");
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
contains(assets, /requireVisibility\(input\.visibility \|\| "team"\)/, "New library imports must default to team visibility.");
contains(types, /roleAddedAt: Partial<Record<LibraryAssetRole, string>>/, "Library assets must expose role-specific entry timestamps.");
contains(sort, /getLibraryAssetAddedAt[\s\S]*asset\.roleAddedAt\?\.\[role\] \|\| asset\.createdAt/, "Historical assets must fall back to their original creation time per existing role.");
contains(database, /fromLibraryAssetJson[\s\S]*for \(const role of asset\.roles\)[\s\S]*getLibraryAssetAddedAt\(asset, role\)/, "Database reads must normalize historical role entry timestamps.");
contains(assets, /roleAddedAt: \{ \[role\]: now \}/, "New imports must record their initial role entry time.");
contains(assets, /roleAddedAt: reconcileLibraryRoleAddedAt\(asset, roles, now\)/, "Role edits must reconcile role entry timestamps.");
contains(assets, /roles: \[\.\.\.asset\.roles, role\],[\s\S]*roleAddedAt: reconcileLibraryRoleAddedAt/, "Cross-role reuse must record the newly added role time.");
contains(assets, /type LibraryAssetCursor = \{ version: 2; sort: LibraryListSort; role\?: LibraryAssetRole; value: string; id: string \}/, "Sorted image cursors must carry their role-aware sort contract.");
contains(assets, /compareAssets\(left\.asset, right\.asset, sort, filters\.role\)[\s\S]*compareAssetToCursor\(asset, cursor, sort, filters\.role\)/, "Image list and cursor pagination must use the same role-aware sort contract.");
contains(assets, /decoded\.version === 2[\s\S]*decoded\.role === role/, "Image cursors must reject another library role.");
contains(assets, /getLibraryAssetAddedAt\(asset, filters\.role\) >= filters\.addedFrom[\s\S]*getLibraryAssetAddedAt\(asset, filters\.role\) < filters\.addedBefore/, "Added-time filtering must include the lower bound and exclude the upper bound.");
contains(assets, /Library role is required for added-time filtering\.[\s\S]*Library added-time range must start before it ends\./, "Added-time query validation is incomplete.");

const routeFiles = [
  "src/app/api/library/assets/route.ts",
  "src/app/api/library/assets/[id]/route.ts",
  "src/app/api/library/import/route.ts",
  "src/app/api/library/collections/route.ts",
  "src/app/api/library/collections/[collectionId]/assets/[assetId]/route.ts",
  "src/app/api/library/tagging/route.ts",
  "src/app/api/library/tagging/jobs/route.ts",
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
contains(assets, /removeRole\?: LibraryAssetRole/, "Library role removal must use an explicit patch contract.");
contains(assets, /if \(patch\.roles && removeRole\)[\s\S]*if \(patch\.roles && !roles\.length\) throw new Error\("Select at least one library role\."\)/, "General asset edits must not create role-less assets.");
contains(page, /role="combobox"[\s\S]*aria-autocomplete="list"[\s\S]*aria-activedescendant/, "Unified tag picker must expose combobox semantics.");
for (const key of ["ArrowDown", "ArrowUp", "Enter", "Escape", "Backspace"]) assert(page.includes(`event.key === "${key}"`), `Tag combobox keyboard contract missing ${key}.`);
contains(page, /filterTags\.forEach\(\(tag\) => params\.append\("tag", tag\)\)/, "Library UI must submit repeated unified tag filters.");
contains(page, /params\.set\("addedFrom", activeTimeRange\.addedFrom\)[\s\S]*params\.set\("addedBefore", activeTimeRange\.addedBefore\)/, "Library UI must submit the applied entry-time range through every query-string consumer.");
for (const label of ["全部时间", "今天", "近 7 天", "近 30 天", "自定义"]) assert(page.includes(label), `Entry-time filter option missing ${label}.`);
contains(page, /type="date"[\s\S]*max=\{customDateTo \|\| undefined\}[\s\S]*type="date"[\s\S]*min=\{customDateFrom \|\| undefined\}[\s\S]*disabled=\{!customRangeValid\}[\s\S]*applyCustomTimeRange/, "Custom entry-time range validation and apply control are incomplete.");
contains(page, /setTimePreset\("all"\)[\s\S]*setCustomTimeRange\(undefined\)/, "Clearing library filters must reset the entry-time range.");
contains(page, /className=\{styles\.cardAddedAt\} dateTime=\{addedAt\}[\s\S]*入库 \{formatLibraryDateTime\(addedAt\)\}/, "Library cards must display the exact role entry time semantically.");
assert((page.match(/加入当前图库/g) || []).length >= 2, "Library detail and fullscreen preview must both display the current-role entry time.");
contains(page, /buildLibraryPresetRange[\s\S]*end\.setHours\(0, 0, 0, 0\)[\s\S]*end\.setDate\(end\.getDate\(\) \+ 1\)/, "Quick entry-time ranges must use local calendar-day boundaries.");
contains(page, /buildCustomLibraryTimeRange[\s\S]*localDateBoundary\(to, 1\)/, "Custom entry-time ranges must include the complete end date.");
for (const label of ["最新导入", "最早导入", "名称 A-Z", "名称 Z-A", "提交人 A-Z", "提交人 Z-A"]) assert(page.includes(label), `Image sort option missing ${label}.`);
contains(page, /useLibraryListSort\(librarySortStorageKey\)/, "Image sort preference must persist in browser storage.");
contains(page, /useMarqueeSelection[\s\S]*data-marquee-id=\{asset\.id\}/, "Image grid marquee selection is missing.");
contains(page, /const selectAllAssets = useCallback[\s\S]*while \(cursor\)[\s\S]*setSelected\(new Set\(assets\.map/, "Image select-all must load every cursor page before selecting the filtered result.");
contains(page, /event\.key\.toLowerCase\(\) !== "a"[\s\S]*isEditableTarget\(event\.target\)[\s\S]*void selectAllAssets\(\)/, "Image select-all shortcut must use Ctrl or Cmd+A without intercepting editable controls.");
contains(page, /aria-label="全选当前筛选结果"[\s\S]*aria-keyshortcuts="Control\+A Meta\+A"/, "Image library must expose the select-all control and shortcut semantics.");
contains(css, /\.filterBar select option[^}]*background:var\(--library-panel\)[^}]*color:var\(--library-text\)/, "Image-library native options must keep a solid, theme-aware background and readable text.");
contains(page, /form\.set\("visibility", "team"\)/, "Image upload UI must submit team visibility by default.");
contains(page, /const importItemSequence = useRef\(0\)/, "Image uploads must keep a page-local queue sequence.");
contains(page, /id: `\$\{Date\.now\(\)\}-\$\{\+\+importItemSequence\.current\}`/, "Image uploads must create unique temporary queue ids without secure-context APIs.");
assert(!/randomUUID/.test(page), "The browser upload queue must not depend on crypto.randomUUID.");
contains(page, /try \{\s*const form = new FormData\(\)[\s\S]*catch \(error\) \{\s*updateImport\(item\.id, "error"/, "Synchronous upload preparation failures must update the visible import row.");
contains(page, /BatchTagManager[\s\S]*只读团队资产会跳过/, "Batch tag management and read-only feedback are missing.");
contains(page, /restoreAi: manualTagKeys/, "Restore AI must clear every manual tag override.");
contains(page, /role: activeRole, assetIds: \[asset\.id\]/, "Single-asset tag changes must carry the active library role.");
contains(page, /role, assetIds: \[\.\.\.selected\]/, "Batch tag changes must carry the active library role.");
contains(page, /JSON\.stringify\(\{ removeRole: role \}\)/, "Batch removal must use the explicit library-role removal contract.");
contains(page, /saveAsset\(\{ removeRole: activeRole \}\)/, "Preview removal must use the explicit library-role removal contract.");
contains(page, /if \(!roles\.length\)[\s\S]*请至少保留一个图库角色/, "The asset editor must explain why an empty role selection cannot be saved.");
contains(page, /getStoredTheme[\s\S]*setStoredTheme[\s\S]*themeOptions/, "Library theme switcher is not synchronized with global theme storage.");
contains(css, /--library-bg:var\(--background\)/, "Library surfaces must use global theme variables.");
contains(css, /\.previewStage\{[^}]*background:#0d1013/, "Preview image stage must remain neutral dark.");
contains(css, /\.previewInfo\{background:var\(--library-panel\)/, "Preview details must follow the active theme.");
contains(css, /\.marquee\{[^}]*position:fixed/, "Image marquee styling is missing.");
contains(css, /\.page\{[^}]*height:100dvh[^}]*overflow:hidden/, "Library page must stay viewport-bound so its navigation remains fixed.");
contains(css, /\.workspace\{[^}]*min-height:0[^}]*overflow:hidden/, "Library assets must scroll inside the bounded workspace.");
contains(css, /\.filterBar\{flex-wrap:wrap\}/, "Library filters must wrap after adding time controls.");
contains(css, /\.customDateRange\{[^}]*flex:1 1 100%/, "Custom date controls must use a stable full-width row.");
contains(css, /@media\(max-width:700px\)[\s\S]*\.customDateRange\{grid-column:1\/-1/, "Custom date controls must remain bounded on mobile.");
contains(home, /href="\/library\?role=reference"/, "Content desk reference-library entry is missing.");

console.log("Reference library assets, unified tags, themes, permissions, and preview contract check ok");
