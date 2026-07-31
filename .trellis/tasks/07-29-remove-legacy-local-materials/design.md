# Technical Design

## Boundaries

- `src/app/content/page.tsx` loses only the legacy material desk. Content-pool, crawl, cache, and review behavior remain.
- `src/app/page.tsx` replaces legacy material state with `LibraryAssetPage` vehicle-library state loaded from `/api/library/assets?role=vehicle` across all cursors.
- `src/app/api/simple/runs/route.ts` owns the browser-to-domain trust boundary: selected ids are resolved through authenticated library access, role-checked, and converted into frozen public URLs.
- `src/lib/simple-runs.ts` and persisted `SimpleRunInput` continue carrying URL snapshots so queued workers never reread mutable library state.
- `src/lib/viral-replication.ts` accepts HTTP(S) material URLs as indexed images while preserving local-path compatibility for historical queued runs.
- `src/lib/database.ts` removes legacy CRUD/schema/bootstrap code and performs an idempotent retirement drop for existing SQLite/PostgreSQL tables.

## Data Flow

```text
Authenticated vehicle-library API
  -> paginated LibraryAsset/LibraryCollection records
  -> compact picker selects asset ids
  -> POST /api/simple/runs
  -> getLibraryAsset(account, id) + vehicle-role validation
  -> freeze publicUrl[] into SimpleRunInput
  -> durable queue worker
  -> viral pairing accepts HTTPS URLs
  -> existing strict dual-reference image generation
```

## Retirement Behavior

- Remove `/api/materials/library`, `/api/materials/scan`, `/api/materials/preview`, and `/api/library/migrate`.
- Remove `src/lib/material-library.ts`, `src/lib/materials.ts`, legacy shared types, persistence helpers, schema declarations, and JSON import handling.
- Existing databases drop `material_assets` before `material_folders`; the operation is idempotent and never opens or deletes the referenced filesystem paths.
- `data/material-library.json` is no longer read. The task does not delete this local runtime artifact or any source image.

## Compatibility

- Historical simple runs can retain `materialPaths` and `viralMaterialPaths`; remote URL support is additive, and local paths remain readable by workers while those histories exist.
- TOS-backed `library_assets` and related tables are unchanged.
- No production VPS, Docker volume, TOS object, or account data is mutated during this task.

## Rollback

- Reverting the code recreates empty legacy tables through the older schema on next startup.
- Removed legacy index rows are intentionally not restored; original image files remain available for manual re-import if required.
