# Unified Library

Last updated: 2026-08-28

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
