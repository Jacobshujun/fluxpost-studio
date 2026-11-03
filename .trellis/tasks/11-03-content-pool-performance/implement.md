# Implement: content-pool performance

## Phase 0 — task setup

- [x] Create Trellis task `11-03-content-pool-performance`.
- [x] Write `prd.md`, `design.md`, `implement.md`.
- [x] Run `python ./.trellis/scripts/task.py start 11-03-content-pool-performance`.
- [x] Inspect current branch/worktree; implementation stays in the primary worktree on `local`.

## Phase 1 — P0 library operations

### DB (`src/lib/database.ts`)

- [x] Add `getContentPoolItemOwnersByIdsFromDb(ids)` with per-id GIN lookup, 10-way batching, owner-aware dedupe.
- [x] Add `listContentPoolCollectionItemsForItemIdsFromDb(ids)` and `countContentPoolCollectionItemsByCollectionFromDb()`.
- [x] Keep existing membership write helpers unchanged.

### Domain (`src/lib/content-pool-collections.ts`)

- [x] `listContentPoolCollections()` uses grouped counts.
- [x] `updateContentPoolCollectionItems()` reads only selected items/memberships.
- [x] Return/extend collection API responses with `collections` (create/rename/delete).
- [x] Preserve delete-reparent semantics and only remove memberships for the deleted collection.

### API routes

- [x] `POST /api/content-pool/collections` returns `{ collection, collections }`.
- [x] `PATCH /api/content-pool/collections/[id]` returns `{ collection, collections }`.
- [x] `DELETE /api/content-pool/collections/[id]` returns `{ deleted, collectionId, collections }`.
- [x] Batch route unchanged.

### Client (`src/app/content/page.tsx`)

- [x] `saveCollection`/`deleteCollection`/`postCollectionBatch` update local state; no `loadContentPool()`.
- [x] Owner-aware membership merge; library count deltas.
- [x] Fix the delete-descendant view reset bug.
- [x] Non-blocking desk/summary refresh only when the visible library scope changes.

### Gate P0

- [x] `node .trellis/verification/content_pool_collections_check.mjs`.
- [x] `python .trellis/verification/content_pool_libraries_browser_check.py` (worker-disabled 45678).
- [ ] Manual/DB timing: create library, add 100/200 items.

## Phase 2 — P1a raw removal

- [x] Strip `raw` from `/api/content-pool/desk`, `/api/content-pool`, `GET /api/content/items`.
- [x] Strip `raw` from crawl-job, link-import and content-item POST/PATCH responses; return project summaries instead of projects with items.
- [x] Confirm no client `.raw` usage remains.
- [x] Confirm raw-derived normalization parity: 0/500 sampled missing-published items had recursive raw timestamps; 0/4 Douyin items without images had carousel raw.
- [x] Gate: focused checks and a snapshot response-size check (desk + summary measured against local DB).

## Phase 3 — P1b desk/summary/ids

### DB

- [x] Add `readContentPoolDeskRowsFromDb()` (PostgreSQL + SQLite light rows; Node does dedupe/filter/sort/pagination).
- [x] Implement owner filter, dedupe, library/default/descendant filters, search, status/platform/project/content-tag/custom-tag filters, all sort modes, keyset cursor, total.
- [ ] Use the tag aggregate for `listContentPoolTagSuggestions()` (still full-pool; deferred).

### Domain/types

- [x] Add `ContentPoolDeskItem`, `ContentPoolDeskPage`, `ContentPoolProjectSummary`, `ContentPoolDeskSummary`, `ContentPoolDeskItemRef` in `src/lib/types.ts`.
- [x] Add `getContentPoolDesk()`, `getContentPoolDeskSummary()`, `getContentPoolDeskIds()` in `src/lib/content-pool.ts`.
- [x] Extract the page-level item normalizer from `refreshProjectStats()` without behavior change.
- [x] Strip `raw` and return page memberships.

### Routes

- [x] `src/app/api/content-pool/desk/route.ts`.
- [x] `src/app/api/content-pool/desk/summary/route.ts`.
- [x] `src/app/api/content-pool/desk/ids/route.ts`.
- [x] Keep `/api/content-pool` as a compatibility snapshot.

### Client

- [x] Replace full snapshot state with `deskSources`/`nextCursor`/`summary`.
- [x] One desk effect after hydration; debounce search; abort stale requests.
- [x] Remove client full-array filtering/sorting/counting.
- [x] "Load more" UI; current-page rendering.
- [x] Selection owner map; `desk/ids` select-all.
- [x] Summary-driven counts/projects/tags; project summary type.
- [x] Replace `loadContentPool()` calls with desk refreshes.

### Gate P1b/P1c

- [x] New `content_pool_desk_check.mjs` (isolated SQLite).
- [x] Update browser checks for desk/summary/ids and load-more.
- [ ] Manual timing: first page, filter/sort, load-more.

## Phase 4 — P1d row-level writes

- [x] Add `readContentProjectsForItemIdsFromDb`, `mutateContentProjectsForItemIdsInDb`, `mutateContentProjectByNormalizedQueryInDb` (media backfill reuses the mutate helper instead of `writeContentProjectsByIdsToDb`).
- [x] Convert `ingestCrawlItems`/`createSourceItem`.
- [x] Convert `updateSourceItem`/`deleteSourceItem`.
- [x] Convert batch status/delete/tag functions.
- [x] Convert `getSourceItemsByIds`/`freezeContentPoolItemsByIds`.
- [x] Convert `media-backfill`.
- [x] Keep tag rename/delete on `mutateAllSourceProjectsInDb`.
- [x] Add `FOR UPDATE` and unique-conflict handling.

### Gate P1d

- [x] `node .trellis/verification/content_projects_upsert_check.mjs`.
- [x] New function-boundary static performance check.
- [ ] Manual timing: crawl ingest, single edit/delete, batch status/delete/tag.

## Phase 5 — full verification

- [x] Update `.trellis/verification/check.mjs` with the new checks.
- [x] `node .trellis/verification/content_pool_collections_check.mjs`.
- [x] `node .trellis/verification/content_pool_desk_check.mjs`.
- [x] `node .trellis/verification/content_pool_performance_check.mjs`.
- [x] `node .trellis/verification/content_desk_check.mjs`.
- [x] `node .trellis/verification/content_projects_upsert_check.mjs`.
- [ ] `node .trellis/verification/canvas_content_pool_selection_check.mjs`.
- [x] `python .trellis/verification/content_pool_libraries_browser_check.py`.
- [x] Full baseline:
  ```powershell
  $env:TRELLIS_SMOKE_PORT = "45678"
  powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
  ```
- [x] Real PostgreSQL read-only desk/summary timing: desk 960 ms, summary 898 ms, total 4,692, no `raw`, 66 KB page.
- [x] Temporary-schema PostgreSQL SQL smoke: GIN lookup, owner-scoped `FOR UPDATE`, normalized-query conflict and light desk scan.
- [ ] Commit, then `npm run local` from a clean HEAD and perform authenticated manual timing on 3001.

## Review gates

1. After P0: library create/add behavior and owner/cross-owner checks.
2. After P1a: browser response shape and no `raw` leakage.
3. After P1b/P1c: pagination correctness, filter/sort parity, selection semantics.
4. After P1d: targeted write correctness, concurrency, no full-table regressions.
5. Before completion: full baseline, lint, types, build, browser checks.

## Rollback points

- P0, P1a, P1b/P1c, P1d are separate commits; revert the failing phase.
- No schema/data migration; the GIN index and table volumes are unchanged.
- If a phase cannot meet its gate, stop and report; do not add fallback code or weaken checks.

## Out of scope

- `content_pool_items` table / GIN replacement / backfill (P2).
- Canvas `listContentPoolSelection` pagination.
- Provider calls, Feishu writes, production deployment.
