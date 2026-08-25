# Design

## Boundary

Only `src/lib/canvas/runs.ts` worker orchestration and its deterministic verification change. The durable queue database APIs, run executor, and shared provider pools keep their existing boundaries.

## Approach

Replace the single `drainCanvasRuns` consumer with a bounded group of independent consumers. Every consumer retains the existing claim, heartbeat, run execution, delayed requeue, and scheduler-wakeup behavior. The group size comes from a dedicated, capped Canvas worker configuration.

Canvas schedules enqueue every eligible child run instead of admitting only 1-5 at a time. Historical `taskConcurrency` values remain readable as inert persisted data, while pause/resume continues to defer and release the durable queue items.

Image nodes continue to use the shared image pool. The worker group therefore permits concurrent queue progress without increasing provider request concurrency. The Klein branch remains controlled by its separate one-slot pool.

## Rollback

Set the new worker configuration to `1` to restore serial queue consumption. No migration or runtime-data change is required.
