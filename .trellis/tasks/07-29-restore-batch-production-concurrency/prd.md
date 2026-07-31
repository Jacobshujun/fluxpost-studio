# 恢复批量生产并发调度

## Goal

Restore concurrent Canvas batch execution so independently queued content/image tasks advance together instead of waiting behind one running task.

## Requirements

- The Canvas run queue must allow a bounded number of queue items to execute concurrently.
- The worker group must retain queue claim, heartbeat, delayed retry, cancellation, and terminal batch wakeup behavior.
- Provider calls must remain bounded by the shared image pool; local ComfyUI Klein work must remain serialized through the existing local image pool.
- No Canvas schedule, workflow, UI, ownership, or persisted-data contract changes are in scope.

## Acceptance Criteria

- [ ] Independent Canvas image runs in one batch are claimed and progressed concurrently.
- [ ] Canvas queue worker concurrency has an explicit environment setting, default, and hard cap.
- [ ] Shared image-pool and local-Klein concurrency rules remain intact.
- [ ] Deterministic checks, type checking, lint, build, and the Trellis baseline pass without live provider calls.

## Confirmed Facts

- The reported Canvas batch has four content tasks and ten image child tasks; only the first content task was running while the remaining three were queued.
- `ensureCanvasRunWorker()` currently creates one global consumer, which awaits each `executeCanvasRun()` before claiming another queue item.
- The shared image pool already bounds image-provider calls, and Klein uses a dedicated hard-capped local image pool.

## Out Of Scope

- No mutation of existing schedules, runs, or provider configuration.
- No increase to the local ComfyUI Klein concurrency limit.
