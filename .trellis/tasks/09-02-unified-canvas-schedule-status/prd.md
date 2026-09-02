# Unified Canvas schedule result status

## Goal

Present one understandable batch-result model. A single result is binary (success or failure); partial is reserved for parent aggregates.

## Requirements

- V1 image results and V2 result cards use one target-artifact projection and one leaf status set without `partial`.
- Preserve successful artifacts and retry only failed image indices or failed Canvas nodes.
- Expose retryability and produced/failed counts at result, group, and batch levels.
- Keep parent aggregation semantics, shared-output completeness, owner/auth boundaries, provider protocols, and raw CanvasRun diagnostics unchanged.
- Lazily correct historical records during detail reads, polling, and worker reconciliation; no database migration.

## Acceptance Criteria

- [ ] No result item is rendered as `partial`; missing/invalid targets and failed image batches render as failed.
- [ ] Every retryable failed result has a clear retry button; groups and batches expose aggregate retry actions and counts.
- [ ] `all` and `at-least-one` aggregation behavior remains correct for mixed results.
- [ ] Shared output gaps fail; historical bad status is corrected without changing raw runs.
- [ ] Focused scheduler checks, TypeScript, lint, build, and the full offline baseline pass.
