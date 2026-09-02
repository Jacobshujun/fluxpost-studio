# Unified Canvas schedule result implementation

1. Start the Trellis task after reviewing these artifacts.
2. Update shared Canvas schedule types with the leaf status and derived result/retry fields.
3. Refactor scheduler reconciliation to use one target-aware leaf projector for legacy and current schedule shapes.
4. Add unified retry-target handling and the schedule-level `retry-all` action while preserving existing actions.
5. Update the schedule API route and Canvas runtime UI labels, counters, leaf states, and retry controls.
6. Extend the deterministic Canvas scheduler verification for binary leaves, failed image batches, aggregate policies, shared gaps, retry actions, historical correction, and UI contracts.
7. Run focused checks, TypeScript, lint, build, and the complete offline baseline.
8. Review, commit, and archive the verified task.
