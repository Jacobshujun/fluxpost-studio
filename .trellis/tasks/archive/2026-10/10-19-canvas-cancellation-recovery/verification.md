# Verification and recovery

## Implemented contracts

- Atomic run, unfinished attempt and queue cancellation; completed results and existing receipts survive. Cancelled schedule/run/attempt fences reject stale writes and fanout. Receipt-only checkpoints retain late external acknowledgements without downstream delivery.
- Running image executions and resource waiters receive abort signals. Encoding runs in a bounded child process; real process closure precedes resource release. Downloads accept cancellation; concurrent same-key uploads use independent staging.
- Explicit retries reject still-executing cancelled runs and iteration children. General non-image providers and started storage uploads retain their worker until the operation settles.
- Scoped recovery requires cancellation intent, or named image-only interruption with an unambiguously dead worker PID. Backup precedes transactional changes; successful nodes are preserved.

## Confirmed isolated checks

- Full deterministic baseline reaches lint successfully. It stops at the unchanged 17 errors in ignored `data/feishu-copy-import` scripts; checks were not weakened.
- Changed source lint: zero errors, nine existing database warnings. TypeScript noEmit passes.
- Cancellation persistence/runtime/scoped recovery, scheduler, concurrency, iteration and real image processing checks pass. PostgreSQL persistence checks execute actual SQL against verified connection-local temporary tables.
- Real-byte cancellation/timeout, no detached encoder, concurrent upload file consumption, late publish/provider receipts, retry during cancellation and following queued work are covered.
- Initial production builds caught a Turbopack fork-path resolution error; explicit Node spawn fixes it. Standalone real-byte execution additionally identified omitted Sharp DLLs; runtime library tracing now includes `@img/sharp-*/lib/**/*`.
- Final standalone production build, traced encoder with actual Sharp native dependencies, isolated worker-disabled HTTP smoke, built-config synchronization and SQLite store checks pass.

## Runtime operation

Clean implementation `52c8c00c2b44eccf55a1c32bba72bba08ed9bb7b` activated through `npm run local:lan` with full-SHA identity, HTTP smoke and 0.0.0.0:3001 binding verified. Old PID 50532 is absent before interrupted-work recovery.

Recovery preview/apply cancelled one schedule and eight abandoned runs/nodes/queues. Both recovery transactions wrote scoped backups under ignored `data/reports/` before changes. A read-only comparison against the cancellation backup confirms every one of the 30 completed main-task snapshots is byte-structurally unchanged; all eight target queue entries are cancelled.

The eight explicitly identified old-worker image runs passed dead-PID/image-only guards and were requeued without resetting successful nodes. At 11:39 local time, the two previously queued schedules were running, ten queue entries had completed since activation, and eleven image-processing nodes had completed. No synthetic provider/publish test batch was launched; existing user queues continued naturally. Unrelated expired historical work was untouched.

Documentation closeout may advance Git HEAD beyond the active implementation commit; avoid restarting running user work for documentation-only changes.

## Limits

Exact original native/IO stall remains unconfirmed. Ordinary interrupted provider jobs and unrelated historical expired rows are not auto-replayed. Non-image external operations are not force-terminated. A narrowly raced iteration child admission may briefly remain queued until its entry guard observes parent cancellation; it cannot execute provider work.
