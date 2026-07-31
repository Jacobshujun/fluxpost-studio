# Canvas Edge Beam Visual Polish Design

## Rendering

Keep the existing route-local custom React Flow edge. Derive a normalized beam profile from the straight-line endpoint distance, then render one continuous `BaseEdge` and three decorative paths using the same Bezier geometry and `pathLength=100`:

1. A long low-opacity source-colored trail.
2. A medium source-colored body mixed lightly toward white.
3. A short bright core biased toward the target side.

Use inline dash profiles derived once per edge. The body targets 40-70 Canvas units, the trail is capped near 110 units, and all layers retain round caps. Animate the normalized dash offset from source to target, fading the full envelope near both endpoints.

## States And Performance

Idle edges use a 3.6 second low-intensity cycle. Selected or queued/running-related edges use the existing display-only emphasis flag with a 1.8 second cycle and restrained filters. Hover raises base contrast without changing the beam phase. The edge-id hash produces a phase fraction that is converted to a negative delay using the active duration.

Viewport movement hides all three decorative paths and removes filters. Reduced-motion does the same permanently while increasing static base-path legibility. No display value is serialized by `currentGraph`.

## Compatibility

No public type, API, graph schema, database, or execution-state changes. Keep the implementation local to the Canvas route and shared styles, and update only the existing deterministic Canvas contract.
