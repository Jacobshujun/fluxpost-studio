# Design: content-pool performance

## 1. Measured root cause

Local PostgreSQL `content_projects` (2026-11-03):

- 88 rows, 5,104 items, 232 MB JSON text (222 MB without JSON quotes), ~35 MB gzip.
- `raw` provider payload = 187 MB (80%); average item = 45.6 KB.
- `SELECT data_json FROM content_projects` = 1.0–1.3 s; Node `JSON.parse` = 0.57 s.
- Table total 1.17 GB; `idx_review_source_items` GIN on the whole JSON = 878 MB.
- All items have `hotScore`, `crawledAt`, `poolStatus`, `mediaCache`; 2,824/5,104 have `publishedAt`.

Whole-pool work:

- `getContentPoolSnapshot()` reads every project, normalizes every item via `refreshProjectStats()`, and returns everything.
- `updateContentPoolCollectionItems()` reads every project plus all memberships before writing.
- `writeContentProjectsToDb()` upserts all 88 rows on crawl ingest, item edit/delete and batch updates.
- `/content` renders every item in `visibleSources.map(...)` and performs several full-array passes.

Per-item lookup measurements:

- One GIN containment lookup (`data_json @> '{"items":[{"id":...}]}'`) = ~0.35 ms DB time.
- 200 sequential lookups = 3.3 s; 200 with 10-way concurrency = ~0.8 s; 50 = ~0.2 s.
- `@> ANY(...)`, 200 `UNION ALL` branches and lateral scans degrade to full scans (0.5–27 s).

Desk query measurements (warm cache):

- Largest owner (2,068 items): page + total + projects = 632 ms; with tags/library counts = 802 ms.
- Admin (5,104 items): page + total + projects = 799 ms.
- 50 light items ≈ 710 KB response.

## 2. P0 — library operations

### DB helpers (`src/lib/database.ts`)

- `getContentPoolItemOwnersByIdsFromDb(ids)`:
  1. Per-id GIN query `SELECT id FROM content_projects WHERE data_json @> $1`, batched at `DATABASE_POOL_MAX`.
  2. One pass over the distinct project rows, extracting only `{ id, ownerUserId }`.
  3. Dedupe by item id with the newest project winning; owner-aware keys.
- `listContentPoolCollectionItemsForItemIdsFromDb(ids)`:
  `WHERE item_id = ANY($1)` (SQLite `IN`, chunked at 500), joined to collections for `ownerUserId`.
- `countContentPoolCollectionItemsByCollectionFromDb()`: one `GROUP BY collection_id`.

### Domain (`src/lib/content-pool-collections.ts`)

- `updateContentPoolCollectionItems()` uses the owner lookup instead of `readContentProjectsFromDb()`; current memberships come from the item-scoped helper; the post-write read is also item-scoped.
- `listContentPoolCollections()` uses the grouped count instead of loading all memberships.
- No change to membership semantics, idempotent inserts/deletes, cross-owner rejection, or default-library logic.

### API/UI

- `POST /api/content-pool/collections` → `{ collection, collections }`.
- `PATCH /api/content-pool/collections/[id]` → `{ collection, collections }` (rename may change descendant paths).
- `DELETE /api/content-pool/collections/[id]` → `{ deleted, collectionId, collections }`; children are reparented, not deleted.
- `POST .../collections/batch` keeps its shape; `memberships` contains only affected items.
- Page: `saveCollection`/`deleteCollection`/`postCollectionBatch` replace local state from responses; no `loadContentPool()`. Membership merges use `(ownerUserId, itemId)` keys. Counts are adjusted from membership deltas; a background desk/summary refresh runs only when the visible library scope changes.

## 3. P1a — remove `raw`

- Strip `item.raw` at the API boundary for `/api/content-pool/desk`, `/api/content-pool`, and `GET /api/content/items`.
- Server-side detail/AI/media/Feishu/Canvas paths keep full items.
- The `/content` page has no `item.raw` usage (verified by grep).

## 4. P1b/P1c — desk pagination

### Endpoints

1. `GET /api/content-pool/desk`
   - Params: `library=all|default|<id>`, `descendants`, `q`, repeated `status`/`platform`/`contentTag`/`customTag`, `projectId`, `sort`, `cursor`, `limit` (40/100), `includeTotal`.
   - Response: `{ items: ContentPoolDeskItem[], nextCursor?, total?, hasMore, memberships }`.
   - `ContentPoolDeskItem = Omit<NormalizedSourceItem, "raw"> & { projectId, projectName }`.
   - `memberships` are page-item, visible-collection memberships.
   - Keyset cursor `{ sort, sortValue, projectId, itemId }` (base64url). Missing `publishedAt` uses a direction-specific sentinel to keep "missing last".
2. `GET /api/content-pool/desk/summary`
   - Params: `library`, `descendants`, `query`.
   - Response: `{ projects, activeProject, collections, libraryCounts, libraryStats, tags }`.
   - `query` only selects activeProject; it does not filter items.
3. `GET /api/content-pool/desk/ids`
   - Same filters, limit 200, response `{ id, ownerUserId }[]`.

### Implemented shape (`src/lib/database.ts` + `src/lib/content-pool.ts`)

SQL does one light-row scan; dedupe/filter/sort/pagination run in Node.

```sql
WITH projects AS MATERIALIZED (
  SELECT p.id, p.query, p.updated_at, p.last_crawled_at, p.normalized_query, p.created_at,
         p.data_json->>'ownerUserId' AS owner_user_id, p.data_json
  FROM content_projects p
  WHERE <owner filter>
)
SELECT p.id, p.query, ..., item - 'raw' AS item
FROM projects p
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.data_json->'items','[]'::jsonb)) item;
```

- Owner filter extracts project metadata once inside `projects AS MATERIALIZED`; admin has no filter.
- Measured: 5,115 light rows / ~46 MB in ~1.0 s; Node desk ~914 ms, summary ~868 ms.
- Why not SQL-side filtering: repeated JSONB field access after the lateral expansion re-detosted the 222 MB project JSON and produced 63 s queries even after the owner fix. `item - 'raw'` evaluated once is cheap; predicates/window functions over item fields are not.
- `getContentPoolDesk`/`Summary`/`Ids` reuse one context loader: visible collections, membership index, dedupe by newest project, library/default/descendant scope, then filters/sorts/keyset pagination.
- Membership matching is owner-aware: owned items require `c.owner_user_id = item.ownerUserId`; unowned legacy items match any visible collection by bare item id.
- Custom-tag filters/counts use `contentPoolCustomTagKey`; search uses NFKC normalization in Node, so client/server semantics stay aligned.
- Page items are normalized once by the existing page-level normalizer, then returned without `raw`.
- SQLite uses `json_each` / `json_remove(item.value,'$.raw')` with the same Node pipeline.
- Raw-derived repairs were measured before accepting SQL-side stripping: 2,280/5,115 items lack `publishedAt`, but 0/500 sampled had any recursive raw timestamp key, and 0/4 Douyin items without images had carousel keys in raw. Current data therefore keeps normalization parity without transferring raw.
- Crawl-job, link-import and content-item mutation responses also strip `raw` and return project summaries instead of full projects.

### Client

- Replace `sources`/`projects` with `deskItems`, `total`, `nextCursor`, `summary`.
- One effect drives desk requests after URL hydration; 250–300 ms search debounce; `AbortController`.
- Render only the current page; "load more" appends.
- Selection keeps ids plus an owner map; "select all filtered" uses `desk/ids`.
- `libraryStats`/`libraryCounts`/`tags`/`projects` come from summary; `activeProject` is a `ContentPoolProjectSummary` without `items`.
- All `loadContentPool()` calls become `reloadDesk()`; item mutations refresh the current page and, when needed, summary.

## 5. P1d — row-level content-project writes

New DB helpers:

- `readContentProjectsForItemIdsFromDb(ids)`: per-id GIN lookup -> distinct project ids -> one row read; caller applies owner visibility.
- `mutateContentProjectsForItemIdsInDb(ids, scope, mutate)` with `FOR UPDATE`; non-admin scope excludes projects owned by another account (unowned legacy projects remain eligible and still check item ownership).
- `mutateContentProjectByNormalizedQueryInDb(normalizedQuery, create, mutate)` using the unique index; concurrent insert conflicts re-read and re-apply the mutation.
- Keep `writeContentProjectsToDb()` for migration/full scenarios. Media backfill uses the mutate helper instead of a separate by-ids upsert.

Call sites:

- `ingestCrawlItems`/`createSourceItem`: target project by normalized query.
- `updateSourceItem`/`deleteSourceItem`: projects containing the item.
- Batch status/delete/tag: affected project ids in one transaction.
- `getSourceItemsByIds`/`freezeContentPoolItemsByIds`: by-id lookup.
- `media-backfill`: read only containing projects, then re-read/mutate those rows so concurrent item edits are preserved.
- Tag rename/delete keeps `mutateAllSourceProjectsInDb` (rare, already updates only changed rows).
- Canvas `listContentPoolSelection` stays full-pool in this task.

Consistency: `FOR UPDATE` per project; new-project insert uses the unique index and re-reads on conflict.

## 6. Tradeoffs / compatibility

- No schema migration, no new indexes, no data migration; rollback is a revert.
- The 878 MB GIN index remains; single-item edits still rewrite their project JSON (up to ~22 MB).
- Desk queries still scan the owner's JSON; measured ~0.5–0.9 s. P2 is required for <150 ms.
- Admin queries scan all 5,104 items; initial page target <2 s.
- Search NFKC differences and cross-page selection semantics are explicit risks.
- `same itemId` across owners must use `(ownerUserId, itemId)` keys.
- If 200-item library adds exceed 1.5 s, add the small `content_pool_item_refs` table as P1.5 only after separate confirmation.

## 7. Verification design

- Extend the collections worker: nested rename paths, delete/reparent semantics, idempotency, cross-owner failures.
- New `content_pool_desk_check.mjs` (isolated SQLite): pagination, load-more, filters, sorts, owner isolation, no `raw`, counts, `ids`.
- New `content_pool_performance_check.mjs`: function-boundary static budgets for hot paths.
- Update `content_desk_check.mjs`, `content_projects_upsert_check.mjs`, `content_pool_collections_check.mjs`, browser checks.
- Optional loopback-only PostgreSQL benchmark `content_pool_performance_pg.mjs`.
- Full baseline + lint + `tsc --noEmit` + build; manual authenticated timing on 3001.
