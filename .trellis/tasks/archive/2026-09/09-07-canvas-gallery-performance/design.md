# Technical design

## Frontend

- Keep `LibraryImageSnapshotPicker` route-local. Track a `hasQuery`/active-query state so empty filters render an idle prompt. Debounced search and filter changes use AbortController plus request generation checks.
- Render result and selected cards with `<Image loading="lazy" decoding="async">` against `asset.thumbnailUrl` or the square thumbnail endpoint. Keep original `urls` only for preview and snapshot execution.
- Load navigation from an explicit user interaction (collection select/focus), cache the in-flight promise/result, and never block search loading on it.
- Export `CanvasFlowNode` through `memo`; remove `selectedNodeId` from `CanvasNodeInteractionContext` and rely on React Flow's `selected` prop.

## API/data

- Extend `LibraryAssetFilters`/`LibraryAssetPage` with an optional total-count flag/result. Normalize `includeTotal` to true by default for compatibility.
- `queryLibraryAssetsFromDb` runs count query only when requested; list query and cursor semantics remain unchanged.
- Parse `count=0` (or `includeTotal=false`) in the assets route. Canvas requests the lightweight mode; `/library` keeps default exact totals.
- Thumbnail route evaluates `If-None-Match` against the deterministic ETag and returns 304 before writing the body on a cache hit.

## Compatibility and failure handling

- Preserve owner and visibility predicates and existing signed cursor signatures; the count flag is excluded from cursor identity.
- If a thumbnail fails, show the existing visible error state and do not fall back to bulk original-image loading.
- Legacy workflows lacking asset ids keep their stored URL preview behavior only for those specific items.
