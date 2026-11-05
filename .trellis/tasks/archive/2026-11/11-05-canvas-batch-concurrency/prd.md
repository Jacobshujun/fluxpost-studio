# Canvas batch concurrency

## Problem and request

Operator reports extensive queued batch child runs while the provider has no
concurrency limit. Read-only runtime inspection found 8 fresh Canvas leases,
33 queued runs created within the last two hours, and default Canvas worker
concurrency 8 (hard cap 20), versus image pool 100. PostgreSQL had no observed
lock wait and the current server working set was about 630 MiB. These are
point-in-time diagnostics, not a throughput benchmark.

## Scope

- Raise default Canvas run worker count to 32 and configurable hard cap to
  100 using existing WORKER_CANVAS_RUN_CONCURRENCY.
- Keep image pool 100, explicit lower operator values, other resource pools,
  leases, cancellation, task acceptance/retry and provider formats unchanged.
- Document bounded concurrency; do not remove all resource protection or
  claim supplier throughput/concurrency acceptance from offline checks.
- No stale queue repair, task cancellation or database mutation.

## Acceptance and verification

- Default 32, valid explicit values 1–100, invalid input fallback, hard cap
  and queue worker fan-out are verified with existing deterministic test.
- Calling ensureCanvasRunWorker repeatedly cannot over-spawn workers;
  active slots reduce newly started workers; settled workers release slots.
- Full baseline on isolated smoke port 45678 and production build pass.
- Record exact runtime activation state. A restart of active provider work
  must not be hidden or described as interruption-free.

Affected files: concurrency.ts, existing concurrency_check.mjs,
targeted architecture/status documentation and this task evidence. No UI change.
