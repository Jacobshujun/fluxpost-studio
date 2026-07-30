# Design: Canvas Viewport Detail Tiers

## Boundary

The change remains client-side and display-only. It touches the Canvas route, shared Canvas CSS, deterministic Canvas verification, and a task-local mocked browser check. No API, persistence, scheduler, provider, or runtime-data contract changes.

## Data Flow

1. React Flow supplies the actual `Viewport` to `onInit`, `onMoveStart`, `onMove`, and `onMoveEnd`.
2. `canvasViewportDetail(zoom)` maps zoom to `full`, `reduced`, or `overview` using module constants.
3. `syncCanvasViewportDetail(stage, zoom)` compares the next tier with `stage.dataset.canvasViewportDetail`; it writes only when the tier changes.
4. CSS selectors below `.canvas-stage[data-canvas-viewport-detail=...]` change paint visibility while preserving layout boxes.
5. The existing `.canvas-stage-viewport-moving` class is the transient override for all tiers. It continues to be toggled directly on the stage DOM.

## Tier Policy

- `full`: zoom at or above `0.65`; current rendering is unchanged.
- `reduced`: zoom below `0.65` and at or above `0.35`; unselected rich media and result previews use `visibility: hidden`, preserving their boxes.
- `overview`: zoom below `0.35`; unselected node content and unreadable text chrome use `visibility: hidden`, while node outline, color/icon identity, handles and edge geometry remain.
- Moving override: all node rich media/results, resize controls, shadows/filters and MiniMap are hidden or neutralized regardless of tier. The selected-node exception applies only while stationary.

## Compatibility

- `visibility: hidden` is used instead of `display: none` for node content so React Flow measurements and edge anchors do not move.
- The tier lives only in a stage `data-*` attribute. `currentGraph(...)` continues to serialize nodes, business edges and viewport only.
- Existing edge movement suppression and reduced-motion selectors remain intact.
- Initial tier is synchronized from the instance viewport in `onInit`; workflow selection and history viewport restoration synchronize the target tier before/with the viewport change.

## Trade-offs

- Rich content temporarily disappears while the viewport moves. This is intentional progressive detail: users cannot reliably inspect media during a transform, and content returns immediately afterward.
- MiniMap remains mounted, so React Flow may still compute its internal viewport state. Hiding it removes paint/composite work without introducing a React start/end rerender or changing MiniMap behavior after movement.
- Thresholds are constants and can be tuned later from real operator traces. This phase does not add user settings or persisted preferences.

## Rollback

Remove the detail helper/callback wiring and the new CSS selectors. No data migration or graph repair is required because no persisted contract changes.
