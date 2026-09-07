# Implementation checklist

1. Update shared library filter/page types and database query to make total counting optional.
2. Parse the lightweight count option in `/api/library/assets`; add conditional ETag/304 handling to the thumbnail route.
3. Refactor `LibraryImageSnapshotPicker` for idle-on-open, 24-item debounced paging, lazy navigation, thumbnail rendering, and stale-request guards.
4. Memoize `CanvasFlowNode`, remove selected-node state from interaction Context, and preserve run-result updates.
5. Add deterministic static/browser checks for no initial requests, limit/count query, thumbnail-only list rendering, and 30-item selection behavior.
6. Run focused checks, `npx --no-install tsc --noEmit`, `npm run lint`, `npm run build`, and `.trellis/verification/check.ps1`.

Rollback points: API/type changes, picker UI, and node memoization are separable; revert each group independently if a focused contract or build check fails.
