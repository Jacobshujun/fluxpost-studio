# Unified Library

Last updated: 2026-09-07

## Scenario: Unified, Query-Driven Image Assets

### 1. Scope / Trigger

- Applies to image assets, ordinary collections, smart folders, favorites, tags, library APIs/UI, Canvas library sources, and simple-mode vehicle material.
- The active product has one asset pool. `reference | vehicle` is migration input only and must not reappear in public types, routes, URLs, or UI.

### 2. Signatures

- List: `GET /api/library/assets` accepts search, collection/smart-folder/system-view filters, structured tag dimensions, visibility, tagging status, sort, signed cursor, and `limit` (`60` default, `100` maximum).
- Navigation: `GET /api/library/navigation` returns ordinary collections, smart folders, and lazy system counts separately from asset pages.
- Organizers: `GET|POST|PATCH|DELETE /api/library/collections` and `/api/library/smart-folders`; collection item routes use stable IDs.
- User state: `GET|POST|DELETE /api/library/favorites`.
- Batch selection:

```ts
type LibrarySelection =
  | { mode: "ids"; assetIds: string[] }
  | { mode: "query"; filters: LibraryAssetFilters; excludedAssetIds?: string[] };
```

- DB: `library_assets` stores indexed scalar projections plus `data_json`; collection membership, flattened labels, favorites, and smart folders use relational tables. PostgreSQL migration is `db/migrations/005_unified_library.sql`.

### 3. Contracts

- Assets have no role. One asset may belong to zero or more collections; a parent collection includes descendants unless `includeDescendants=false` is explicitly serialized.
- Legacy owner/role pairs migrate to deterministic private roots named `参考图库` and `车型库`. Their IDs are stored as `unified_library_root:<ownerId>:<legacyRole>` in `app_meta`.
- Deleting a collection removes its memberships and reparents direct children; it never deletes asset objects.
- A member may organize any readable team asset in collections they manage. Only the asset owner or an administrator may edit asset metadata. Favorites are per user.
- Smart folders contain one non-nested `all | any` condition list. Team folders are readable but editable only by their owner or an administrator.
- New imports remain `taggingStatus: "idle"`; only explicit single/batch/retry commands enqueue AI tagging.
- List filtering, permission checks, ordering, totals, and keyset pagination execute in PostgreSQL/SQLite. Cards receive compact data and `thumbnailUrl`; original URLs are reserved for preview.
- Canvas and simple mode resolve accessible collection/smart-folder filters before launch and persist frozen asset snapshots.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Public request contains `role`, `roles`, or `roleAddedAt` | HTTP `400`; no write |
| Cursor sort or normalized filter signature differs | Reject cursor; do not mix result sets |
| Collection/smart folder is private to another member | Behave as not found/readable only according to workspace access |
| Team organizer edited by non-owner member | Explicit read-only error |
| Batch query includes excluded IDs | Resolve current authorized matches in SQL, remove exclusions, then process bounded chunks |
| Permanent delete lacks `confirm: true` | HTTP `400`; no object cleanup |
| Object cleanup fails | Preserve `cleanupStatus: "failed"` and retryable per-item error |
| PostgreSQL placeholder is reused for text and timestamp | Invalid migration; use separately typed placeholders |

### 5. Good/Base/Bad Cases

- Good: select a parent collection, include descendants, filter two tags with AND semantics, load 60 thumbnails, then batch-favorite all matches with a query selection and exclusions.
- Base: a shared team asset is read-only in details but can be placed in the current member's private collection and independently favorited.
- Bad: load all asset JSON into Node/browser, use offset paging, render TOS originals in cards, calculate every smart-folder count on first paint, or keep a hidden `role` compatibility branch in active APIs.

### 6. Tests Required

- `.trellis/verification/unified_library_runtime_check.mjs` uses an isolated SQLite fixture to verify role migration, owner isolation, hierarchy, historical Canvas conversion, cursor paging, tags, favorites, all smart-folder fields, `all/any`, and team read-only behavior.
- `.trellis/verification/unified_library_postgres_benchmark.mjs` creates and drops a unique PostgreSQL schema, inserts 50,000 assets plus 1,000,000 label relations, and requires common list/filter P95 below `300ms` and navigation metadata P95 below `500ms`.
- `.trellis/verification/library_collection_batch_browser_check.py` mocks APIs and checks 1440x960 plus 390x844 layouts, bounded first render, thumbnails, debounce, notes, preview, descendant mode, smart folders, query selection, and horizontal overflow.
- The complete Trellis baseline, TypeScript, lint, build, isolated HTTP smoke, and SQLite store check must remain green without live provider/storage writes.

### 7. Wrong vs Correct

```ts
// Wrong: false is dropped, so the server can apply its descendant default.
if (!value) return;

// Correct: preserve the explicit collection scope switch.
if (value === undefined || (value === false && key !== "includeDescendants")) return;
params.set("includeDescendants", String(value));
```

```sql
-- Wrong: PostgreSQL must infer one parameter as both text and timestamptz.
INSERT INTO app_meta (key, value, updated_at) VALUES ($1, $2, $2);

-- Correct: independently typed placeholders keep migration parsing deterministic.
INSERT INTO app_meta (key, value, updated_at) VALUES ($1, $2, $3);
```

## Scenario: Canvas Library Picker Performance

### 1. Scope / Trigger

- Applies to the Canvas `input.library-images` inspector, asset list API pagination, thumbnail transport, and Flow-node rendering when a large library is present.

### 2. Signatures

- Canvas list requests use `GET /api/library/assets?limit=24&count=0` plus optional `search`, `tag`, `collectionId`, and signed `cursor`.
- `LibraryAssetPage.total` is optional; count-free pages return `assets` and `nextCursor` without running `COUNT(*)`.
- Thumbnail requests use `/api/library/assets/{id}/thumbnail?variant=square&version=2` and support `If-None-Match`/`304`.

### 3. Contracts

- Opening the inspector with no search/tag/collection is idle: no asset or navigation request is made. Navigation loads once on first picker focus.
- Search/filter changes are debounced, abort prior requests, and apply only the newest generation. First pages render at most 24 cards; subsequent pages append by asset ID.
- Cards and selected previews use lazy, fixed-size thumbnails. Original URLs remain in the frozen `assetIds`/`assetNames`/`urls` snapshot and are read only for explicit preview (legacy URL-only entries may display their fallback URL).
- Canvas Flow nodes are memoized and selection comes from React Flow's `selected` prop, not a global selected-node context value.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Empty picker filters | Render empty state; do not call assets API |
| Stale or aborted search response | Ignore response; preserve newest result |
| Duplicate IDs across cursor pages | Keep one card and retain cursor progression |
| More than 30 selected assets | Reject toggle; preserve prior snapshot |
| Thumbnail cache validator matches | HTTP 304 with cache headers; no image body |
| Selected asset no longer in current result page | Keep snapshot and render by ID thumbnail; preview stored URL |

### 5. Good/Base/Bad Cases

- Good: focus the picker, type a query, receive 24 thumbnails, load another cursor page without duplicates, and preview one original on click.
- Base: an old URL-only snapshot continues to display and preview its original URL while new asset-ID snapshots use thumbnails.
- Bad: fetch 100 unfiltered assets on mount, render originals as CSS backgrounds, or put `selectedNodeId` in the context consumed by every Flow node.

### 6. Tests Required

- `.trellis/verification/canvas_library_performance_check.mjs` asserts idle startup, `limit=24`/`count=0`, lazy thumbnail usage, selected-preview fallback, memoized nodes, count-free DB parsing, and conditional 304 support.
- Browser/performance coverage should assert no initial asset/navigation calls, stale-request cancellation, 24-card first render, cross-page dedupe, original-on-preview only, 30-item snapshot retention, and 1440px/390px containment.
- TypeScript, lint, build, isolated HTTP/SQLite smoke, and the complete offline baseline remain required.

### 7. Wrong vs Correct

```tsx
// Wrong: opening the inspector downloads and decodes every original.
<button style={{ backgroundImage: `url(${asset.publicUrl})` }} />

// Correct: cards decode a bounded thumbnail; preview resolves the frozen original.
<Image src={`/api/library/assets/${asset.id}/thumbnail?variant=square&version=2`} loading="lazy" />
```
