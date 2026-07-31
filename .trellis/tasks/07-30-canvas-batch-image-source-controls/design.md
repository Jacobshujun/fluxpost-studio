# Design: Canvas batch image source controls

## Scope and boundaries

The change stays in the existing Canvas scheduler client and its presentation styles. It reuses the authenticated `GET /api/library/assets` cursor contract and does not change scheduling, persistence, database, or authorization behavior.

Affected production files:

- `src/app/canvas/page.tsx`: image-source result paging, bulk/range selection, preview state and controls.
- `src/app/globals.css`: bounded result viewport, compact bulk controls, preview affordance, load-more state, and responsive rules.

Affected verification files:

- `.trellis/verification/canvas_scheduler_check.mjs`: deterministic source-contract assertions.
- `.trellis/tasks/07-30-canvas-batch-image-source-controls/browser_check.py`: mocked desktop/mobile interaction and layout verification.

## Data flow

### Query identity

`ScheduleAssetFilterEditor` will derive one query string from `role`, `filter.search`, `filter.collectionId`, and normalized tags. The initial request uses a bounded page size and stores the returned `LibraryAssetPage`, including `nextCursor`.

Every query change increments a request generation and aborts the prior initial request. A response may update state only when its generation is still current. This prevents an earlier slow request or load-more call from replacing a newer filter result.

### Progressive browsing

The first page is rendered in full. The grid becomes a bounded vertical scroll region. When `nextCursor` exists, a load-more row is rendered after the grid. It supports both an explicit button and `IntersectionObserver` loading when the row approaches the scroll viewport.

Loading another page appends only unknown asset ids and adopts the new cursor and total. It never modifies `filter.assetIds`.

### Cross-page select all

Select-all starts with the assets already loaded, then follows every `nextCursor` using the same frozen query identity. It rejects repeated cursors, deduplicates by stable asset id, and commits only if the request generation is still current. On success it appends all fetched assets to the visible list, clears `nextCursor`, and replaces `filter.assetIds` with all matching ids.

Bulk clear replaces only `filter.assetIds` with an empty array. Both operations are available only for multi-image manual sources. Fixed single-image sources retain the existing one-id replacement rule.

### Range and additive selection

The editor stores a local selection anchor id. For multi-image manual sources:

- ordinary click toggles the target id and updates the anchor;
- Ctrl/Cmd click toggles the target id and updates the anchor;
- Shift click uses the shared `selectIdRange` helper over the ordered loaded ids;
- Ctrl/Cmd+Shift unions the range with the existing selected ids.

On query identity change, the local anchor is cleared. Existing selected ids remain in the schedule filter even when currently hidden by a changed query.

### Preview

Each asset tile has an explicit preview affordance whose event is isolated from selection. Preview is available in both manual and condition-match modes.

The existing Canvas image dialog is extended with optional sequence navigation metadata and previous/next callbacks. Existing node-result previews keep their current single-image behavior. Scheduler preview keeps the active asset id locally, derives its index from the currently loaded ordered assets, and remounts image state when the asset changes so zoom and natural dimensions cannot leak between images.

The dialog keeps Escape/close, zoom, original-image link, focus restoration, and overlay isolation. Optional ArrowLeft/ArrowRight handling and previous/next buttons are bounded at the loaded sequence edges.

## UI layout

- Bulk controls sit beside the match/selection count, not inside every tile.
- The image grid has a stable maximum block size and `overflow-y: auto` with overscroll containment.
- Each tile keeps the existing fixed thumbnail/name rows. Selection remains a full-tile command; preview is a compact Eye icon overlay with an accessible label and tooltip.
- Empty, first-page loading, loading-more, selecting-all, errors, loaded count, total count, and selected count are distinct visible states.
- Mobile reduces columns and wraps the bulk/status row without horizontal overflow.

## Compatibility and rollback

- No API or stored schedule shape changes are introduced.
- Condition-match filters continue to pass the same search, collection, tags, role, mode, and ids to preflight.
- Removing the new client state and CSS restores the prior behavior; no migration or data rollback is needed.

## Risks

- A select-all request can span many cursor pages. The implementation must expose busy state, block duplicate select-all/load-more work, detect cursor repetition, and avoid partial selection commits.
- The scheduler editor autosaves on filter changes. Select-all intentionally produces one final `onChange` call rather than one call per page.
- Preview navigation must not cause the underlying tile selection command or canvas keyboard shortcuts to run.
