# Design: Region-Scoped Batch Bindings

## Binding Contract

Extend `CanvasScheduleParameterBinding` with optional `innerNodeId`:

```ts
// Existing outer-node binding remains unchanged.
{ nodeId: "outer-text", fieldKey: "text" }
// nodeId remains the outer execution/dependency identity.
{ nodeId: "region-a", innerNodeId: "iteration-vision", fieldKey: "prompt" }
```

The field shown above is illustrative; only keys returned by `getCanvasBatchBindableFields` are valid. Resolve `innerNodeId` only inside the named image-iteration region, never by searching all inner graphs. Explicit invalid/empty inner identities must not silently become outer bindings. Do not introduce arbitrary property paths or nested iteration.

This design retains outer dependency identities, so existing UI/backend shared-output ancestry checks naturally include inner parameters. Distinguish bindings by a collision-safe tuple of outer ID, optional inner ID and field key, not labels or concatenated IDs.

## Code Boundaries

- `src/lib/canvas/types.ts`: additive optional inner identity; no schema tables or migration.
- `src/lib/canvas/registry.ts`: browser-safe shared binding enumeration/resolution/identity helpers alongside the existing field allow-list. No dependency on the server scheduler or iteration module (avoid circular imports). Keep unrelated field exposure unchanged.
- `src/app/canvas/page.tsx`: binding options, first/default binding, type changes and select values use complete identities. Display region + inner node + field and short IDs. Keep current controls and layout.
- `src/lib/canvas/scheduler.ts`: preserve and normalize inner identity during save/preflight. Existing outer schedules serialize as before.
- `src/lib/canvas/scheduler-v2.ts`: resolve the actual target for field/type validation and duplicate checks; inject into the cloned inner graph using existing field adapters. Preserve region metadata, edges, outputs and node modes.

## Data Flow

1. Enumerate outer fields and one-level inner fields using the same registry allow-list.
2. Save full bindings in the existing schedule JSON; reload without losing region identity.
3. Preflight validates bindings and expands existing main/child assignments unchanged.
4. For values applicable to each stage, clone the source graph and update only the addressed config. A binding with no value for that stage remains skipped as today. A supplied value with an invalid target must fail explicitly.
5. Existing region execution creates per-image item graphs from the injected snapshot. All images in one scheduled child use that child's parameter assignment; this does not add per-image schedule dimensions.
6. Shared region outputs are permitted with main-scoped parameters only when existing graph rules allow them. Child-scoped bindings prevent sharing the enclosing region and its dependent downstream outputs.

## Compatibility And Risks

- Same inner node IDs commonly occur in multiple regions. Tuple identity must isolate those regions, including collisions with outer IDs.
- Saving through `normalizeCanvasScheduleV2Definition` must not discard `innerNodeId`.
- Existing allow-list excludes credentials, opaque runtime fields and fixed iteration-root configuration; do not broaden it.
- Existing wires may override literal node config at execution time; retain ordinary Canvas precedence rather than inventing a new override mechanism.
- Shared/frozen graphs can replace executable nodes during later stages. Verify call order and only inject stage-relevant parameters before replacement; do not break legitimate aggregate/shared replay.
- Schedule revision/fingerprint checks and source visibility/ownership remain unchanged.

## Release Boundary

No paid provider calls or real data writes for validation. Use documented isolated checks. Port 3001 remains unchanged during implementation and tests; candidate replacement requires verification, commit and release authorization. No sibling worktrees.
