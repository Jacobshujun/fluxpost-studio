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

Recovery preview for the reported schedule selects one schedule and eight abandoned runs/nodes/queue rows. Thirty completed main tasks remain untouched. Activation and live recovery results pending.

## Limits

Exact original native/IO stall remains unconfirmed. Ordinary interrupted provider jobs and unrelated historical expired rows are not auto-replayed. Non-image external operations are not force-terminated. A narrowly raced iteration child admission may briefly remain queued until its entry guard observes parent cancellation; it cannot execute provider work.
