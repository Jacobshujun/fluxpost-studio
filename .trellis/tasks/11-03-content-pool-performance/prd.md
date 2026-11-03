# Content pool performance for libraries and desk

## Goal

Make the `/content` harvesting and content-pool workspace respond quickly:

- Creating, renaming, deleting a content library must update the UI immediately.
- Adding/removing selected items to/from a library must complete in about a second for typical batches.
- Opening `/content`, changing filters/sort, and refreshing after crawl/edit must not read, transfer, or render the entire content pool.

## Confirmed scope

- P0: row-scoped content-library operations + client-local state updates; no full-pool reload after library mutations.
- P1a: remove the unused `raw` provider payload from browser-facing content-pool snapshots.
- P1b/P1c: server-side pagination/filter/sort/count via `desk`, `desk/summary`, `desk/ids`; the content page renders only the current page with "load more".
- P1d: row-level content-project reads/writes for crawl ingest, item edits, batch status/delete/tag changes, and related by-id reads.
- P2 (deferred): normalized `content_pool_items` table, GIN replacement, and data backfill.

## Requirements

1. Content-library APIs must not read or rewrite `content_projects` wholesale for create/rename/delete or membership changes.
2. `updateContentPoolCollectionItems()` must validate only the selected item ids and return memberships only for affected items.
3. Collection create/rename/delete responses must return the updated collections list so the client can update state without a snapshot reload. Deleting a collection reparents children; it does not delete descendants.
4. The content desk must fetch one page (default 40, max 100), with server-side library/default/descendant filters, search, status/platform/project/content-tag/custom-tag filters, and all existing sort modes.
5. The browser must not receive `item.raw` from `/api/content-pool/desk`, `/api/content-pool`, or `GET /api/content/items`.
6. Crawl ingest and item mutations must update only the affected content project row(s), using row locks for consistency.
7. Owner scoping must remain unchanged: members see their records, admins see all, unowned legacy records remain admin-only.
8. No external provider calls and no production deployment in this task.

## Acceptance Criteria

- [ ] Create/rename/delete library: API < 300 ms; the sidebar updates without a `/api/content-pool` snapshot request.
- [ ] Add/remove 100 items: API < 1 s; card chips and library counts update without a full reload. 200 items: roughly 0.8–1.2 s.
- [ ] Initial desk page: admin < 2 s, member < 1 s; response < 2 MB; browser renders only the current page (default 40 cards).
- [ ] Filter/sort change < 1.5 s; "load more" < 1 s.
- [ ] Crawl ingest (excluding provider/media time) for 20 items < 2 s; single item edit/delete < 1 s.
- [ ] `item.raw` absent from all browser-facing content-pool responses; server-side AI/media/Feishu/Canvas paths still read it.
- [ ] `desk/summary` returns projects, activeProject, collections, libraryCounts, libraryStats and tags; `desk/ids` returns up to 200 `{ id, ownerUserId }`.
- [ ] Existing deterministic checks, new desk checks, browser checks, lint, TypeScript, production build and the full Trellis baseline pass.
- [ ] P2 storage refactor is not started; no table migration or data deletion in this task.

## Notes

- Runtime measurement is against the local PostgreSQL `content_projects` table (88 projects, 5,104 items, ~222 MB JSON, ~187 MB `raw`).
- Real authenticated operator timing on port 3001 remains a manual gate.
- The 878 MB `idx_review_source_items` GIN index stays in place; replacing it is P2.
