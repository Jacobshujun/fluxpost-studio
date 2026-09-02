# Technical Design

## Status Projection

`src/lib/canvas/scheduler.ts` owns the projection from durable CanvasRun records to schedule task records. Add target-aware helpers instead of using `scheduleTaskStatusFromRun(run.status)` alone.

- V1 extracts the bound image target output first, then projects `completed`/`partial` only when image URLs exist.
- V2 extracts `definition.childResult` first, then projects `completed`/`partial` only when the expected artifact exists.
- Shared stages require all declared shared outputs; a partial run is not a valid shared-stage completion.

Raw CanvasRun and node-run rows remain unchanged for diagnostics and retry selection.

## Persistence And Compatibility

Schedule reconciliation writes corrected task/main/schedule snapshots through the existing optimistic revision path. No schema changes or migration are needed. Existing persisted statuses are corrected lazily on `getCanvasSchedule`/list/worker reconciliation.

## Error Handling

Use the durable run error when present. Otherwise use stable scheduler-level messages identifying the missing target output. Do not swallow provider or extraction errors.

## UI And Retry

The existing UI labels and retry predicates remain valid once the server projection is corrected. V2 retryability continues to be computed from the underlying node runs, including legacy partial runs with retryable failed nodes.
