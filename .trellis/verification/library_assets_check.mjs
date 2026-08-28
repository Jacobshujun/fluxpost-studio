import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => { const absolute = path.join(root, file); if (!existsSync(absolute)) throw new Error(`Missing file: ${file}`); return readFileSync(absolute, "utf8"); };
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const has = (source, pattern, message) => assert(pattern.test(source), message);
const types = read("src/lib/types.ts");
const database = read("src/lib/database.ts");
const assets = read("src/lib/library-assets.ts");
const page = read("src/app/library/page.tsx");
const css = read("src/app/library/library.module.css");
const migration = read("db/migrations/005_unified_library.sql");

for (const name of ["LibraryAsset", "LibraryCollection", "LibrarySmartFolder", "LibraryAssetFilters", "LibrarySelection", "LibraryNavigation", "LibraryBatchResult"]) has(types, new RegExp(`export type ${name}\\b`), `Missing ${name}.`);
assert(!/export type LibraryAssetRole/.test(types), "Active types must not expose library roles.");
assert(!/roles:\s*LibraryAssetRole|roleAddedAt:/.test(types), "LibraryAsset still exposes role fields.");
for (const table of ["library_assets", "library_collections", "library_collection_assets", "library_asset_labels", "library_smart_folders", "library_asset_favorites"]) has(database, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), `SQLite schema missing ${table}.`);
assert(!/CREATE TABLE IF NOT EXISTS library_asset_roles/.test(database), "Fresh schema must not recreate library_asset_roles.");
has(database, /WITH RECURSIVE collection_tree/, "Collection subtree query is missing.");
has(database, /queryLibraryTagSuggestionsFromDb[\s\S]*GROUP BY LOWER\(label\.value\)/, "Tag suggestions must aggregate in SQL.");
has(database, /search_vector[\s\S]*USING GIN/, "PostgreSQL indexed search vector is missing.");
has(database, /idx_library_asset_labels_filter_lower[\s\S]*LOWER\(value\)/i, "Case-normalized tag filters need a matching expression index.");
has(database, /unified_library_root:/, "Stable migrated-root metadata is missing.");
assert(!/INSERT INTO app_meta \(key,value,updated_at\) VALUES \(\$1,\$2,\$2\)/.test(database), "PostgreSQL migration markers must not reuse one parameter as both text and timestamp.");
has(database, /migrateLegacyLibraryValue[\s\S]*includeDescendants = true/, "Legacy Canvas role migration is missing.");
has(migration, /library_smart_folders[\s\S]*library_asset_favorites/, "Unified PostgreSQL migration is incomplete.");
has(assets, /parseLibraryAssetFilters[\s\S]*Library role filters are no longer supported/, "Public role query rejection is missing.");
has(assets, /filterSignature[\s\S]*stableJson/, "Cursor filters must use a stable recursive signature.");
has(assets, /setLibrarySelectionFavorite/, "Query-selection favorite mutation is missing.");
has(assets, /permanentlyDeleteLibrarySelection/, "Query-selection deletion is missing.");
has(assets, /taggingStatus: "idle"/, "New imports must remain idle until manual tagging.");
assert(!/makeLibraryTaggingJob\(asset/.test(assets.slice(assets.indexOf("export async function importLibraryAsset"), assets.indexOf("export async function patchLibraryAsset"))), "Imports must not enqueue AI tagging.");
has(page, /\/api\/library\/navigation/, "Library navigation must load separately from assets.");
has(page, /thumbnailUrl/, "Library cards must use thumbnail URLs.");
has(page, /mode: "query"[\s\S]*excludedAssetIds/, "Browser selection must support all-matching plus exclusions.");
has(page, /AbortController/, "Asset and tag requests must be cancellable.");
has(page, /setTimeout\(\(\) => setSearch\(searchDraft\.trim\(\)\), 300\)/, "Search debounce is missing.");
has(page, /includeDescendants: view\.kind === "collection" \? includeDescendants : undefined/, "Descendant filtering must be scoped to collection views.");
has(page, /value === false && key !== "includeDescendants"/, "Direct collection queries must serialize includeDescendants=false.");
has(page, /loading="lazy"/, "Thumbnail lazy loading is missing.");
has(page, /SmartFolderDialog/, "Smart-folder editing is missing.");
has(css, /grid-template-columns:repeat\(auto-fill,minmax\(174px,1fr\)\)/, "Stable desktop grid is missing.");
has(css, /@media\(max-width:640px\)[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, "Mobile two-column grid is missing.");
has(css, /height:100dvh;overflow:hidden/, "Library workspace must remain viewport-bound.");

for (const route of [
  "src/app/api/library/assets/route.ts", "src/app/api/library/assets/batch/route.ts", "src/app/api/library/assets/[id]/route.ts",
  "src/app/api/library/import/route.ts", "src/app/api/library/collections/route.ts", "src/app/api/library/navigation/route.ts",
  "src/app/api/library/smart-folders/route.ts", "src/app/api/library/favorites/route.ts", "src/app/api/library/tags/route.ts",
]) has(read(route), /requireWorkspaceAccount\(request\)/, `${route} must require authentication.`);

console.log("Unified library schema, API, SQL query, selection, thumbnail, and responsive UI contracts ok");
