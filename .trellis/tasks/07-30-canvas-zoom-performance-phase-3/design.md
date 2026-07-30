# Design: Stable Canvas Viewport Compositing

## Boundary

The phase remains client-side and display-only. Product code changes are limited to the Canvas CSS surface. Verification may extend the deterministic Canvas contract and add a task-local mocked Chromium check. No React Flow event algorithm, React state, API, persistence, scheduler, provider, or runtime-data contract changes.

## Evidence

- The current 80-node mocked Fit View emitted 40 wheel events and 40 `.react-flow__viewport` style mutations, as expected from React Flow's native D3 transform path.
- The same run produced no long tasks and kept media DOM identity stable, so the task must not claim that business callback coalescing or media remounting is the demonstrated bottleneck.
- CDP LayerTree reported no layer owned by `.react-flow__viewport` while its computed `will-change` was `auto`.
- Injecting `will-change: transform` created exactly one viewport-owned layer with reason `WillChangeTransform`; the sampled node bounds remained identical and the sampled image retained the same DOM identity.

## Rendering Contract

1. React Flow remains the sole owner of wheel, trackpad, pinch, zoom-center and transform updates.
2. `.canvas-stage .react-flow__viewport` receives a stable `will-change: transform` hint for the lifetime of the mounted Canvas.
3. The hint is present before the first gesture, avoiding layer promotion work on the first wheel event.
4. Phase 1 visible-element and edge policies plus phase 2 detail/movement selectors remain unchanged.
5. Media nodes remain mounted. There is no placeholder, conditional media subtree, timer, idle restoration, or resource reload path.

## Trade-offs

- A persistent compositor layer consumes GPU memory. The scope is one React Flow viewport rather than one layer per node, so the memory trade-off is bounded and directly attached to a property that changes on every pan/zoom frame.
- Headless Chromium cannot reproduce every production GPU/input cadence. Acceptance therefore combines non-flaky structural LayerTree evidence, geometry/media identity checks, event/frame telemetry, and operator follow-up rather than enforcing a fragile synthetic FPS improvement threshold.
- No `contain: paint` is applied to the infinite viewport because paint containment could clip nodes outside the viewport's principal box during pan.

## Compatibility And Rollback

- The selector is Canvas-scoped and does not affect other React Flow consumers.
- The transform value remains fully owned by React Flow; the task does not add `transform`, `translate3d`, animation, or transition rules.
- Rollback is removal of the single compositor hint and its focused verification assertions. No data repair is required.
