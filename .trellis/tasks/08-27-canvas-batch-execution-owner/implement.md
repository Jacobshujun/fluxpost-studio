# Implementation Plan

1. Add optional execution-owner fields to `CanvasSchedule` and a scheduler helper with legacy fallback.
2. Capture the authenticated account at launch and use the helper for every scheduled run and background owner actor.
3. Transfer schedule ownership atomically in JSON and the indexed database column; make ordinary Canvas runs use their authenticated launcher.
4. Add deterministic scheduler assertions for launch owner propagation and generated composition ownership.
5. Run focused Canvas scheduler verification, TypeScript, lint, build, and the full Trellis baseline.
