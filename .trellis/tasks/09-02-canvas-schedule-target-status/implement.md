# Implementation Plan

1. Add target-aware V1/V2/shared status projection helpers in `src/lib/canvas/scheduler.ts`.
2. Apply the helpers during V1 and V2 reconciliation without changing aggregate-policy semantics.
3. Extend `.trellis/verification/canvas_scheduler_check.mjs` with missing-target, valid-partial, shared-output, lazy-correction, and mixed-top-level fixtures.
4. Run focused Canvas scheduler verification.
5. Run TypeScript, lint, build, and the full Trellis baseline.
6. Review the diff for scope, update Trellis status/evidence if required, and commit the verified change.
