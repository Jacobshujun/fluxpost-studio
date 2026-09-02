# Unified Canvas schedule result design

## Status model

Introduce `CanvasScheduleLeafStatus` without `partial` for persisted V1 image items and V2 result items. Keep `CanvasScheduleStatus` with `partial` for groups, main tasks, and the top-level schedule. Keep `schemaVersion` as an invisible storage compatibility marker.

Add an optional result summary (`produced`, `failed`) and `retryable` marker to both leaf shapes. These are derived from durable runs and can be lazily backfilled in the existing JSON snapshot.

## Projection

`src/lib/canvas/scheduler.ts` owns one target-aware projector. V1 extracts the bound image artifact; V2 extracts `definition.childResult`. Missing or invalid targets map terminal runs to failed. A valid target maps a run partial caused by unrelated nodes to completed. An image artifact with `imageBatch.failed > 0` maps to failed while retaining successful items and failed-index retry metadata. Shared stages require every declared output and reject partial runs.

Errors prefer the durable run error, then a stable target-missing/type message. Raw CanvasRun and node runs remain unchanged.

## Aggregation and retry

`all` requires every result item to be completed. `at-least-one` accepts any result-producing item and reports parent partial when failures coexist. Existing retry actions delegate to shared retry-target resolution; add a `retry-all` schedule action that marks every retryable leaf/shared stage pending for the worker. Successful artifacts stay attached.

## UI and compatibility

The Canvas page uses batch/group/result terminology and hides V1/V2 and main/child implementation names. Parent headers show completed, failed, and retryable counts. Leaf rows show binary status, produced/failed counts, and the appropriate retry command. Existing API actions remain compatible; only the new batch action is added.
