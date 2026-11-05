# Canvas batch concurrency verification — 2026-11-05

## Diagnosis (read-only local PostgreSQL/runtime)

Runtime candidate `b1fe23b5025521a5106510c480b88b1bae018f9a` uses PID 35108.
Configured Canvas/image/DB pool overrides were absent, selecting defaults
8/100/10. At the first complete snapshot, 8 Canvas leases were fresh and 33
recent runs were queued. Database sessions showed no observed lock waits;
server working set was about 630 MiB. The 83 queue records marked running
included only 8 with fresh leases. Historical stale statuses are separate
from live occupied capacity and were not repaired or deleted.

At 15:09 Asia/Shanghai the queues had reduced to 2 queued entries and 3
fresh Canvas leases (78 records still labeled running in total). This snapshot
does not establish long-term performance or provider concurrency acceptance.
No database writes or provider calls were used in diagnostics/verification.

## Implementation

Changed only Canvas worker default 8 -> 32 and configurable cap 20 -> 100
in `src/lib/concurrency.ts`. Existing operator overrides remain honored and
the image request pool stays 100. Other provider/CPU pools, leases, queue
ordering, graph semantics, cancellation and task submission are unchanged.
Configuration is read on process startup; a LAN restart is needed to apply.

`WORKER_CANVAS_RUN_CONCURRENCY` accepts values 1–100. Values above the cap
clamp to 100; invalid/non-finite or empty values use default 32; nonpositive
numbers clamp to 1. Fractional values retain existing integer-floor behavior.

## Evidence

Updated regression first failed on the old 8/20 source. After changing it:

- Existing `concurrency_check.mjs` executes the actual module under isolated
  environments, checking default, explicit lower/upper values and invalid
  inputs; image pool remains 100.
- Executes the actual `ensureCanvasRunWorker` function with mocked drains:
  active workers consume capacity, repeated kicks do not over-spawn,
  worker identities are unique and settled workers release their slots.
- Existing resource pool cancellation/integration checks pass.
- Full `.trellis/verification/check.ps1` with `TRELLIS_SMOKE_PORT=45678`
  passed all offline checks, ESLint (0 errors / 16 existing warnings),
  TypeScript, Next production build, built config synchronization, isolated
  HTTP smoke and SQLite checks.

Ignored baseline log: `data/gpt-image-probe/canvas-concurrency-baseline.log`.
No unlimited fan-out, paid benchmark, production deployment or runtime data
mutation was added. Provider throughput remains an independent constraint;
Canvas worker count does not equal guaranteed simultaneous image requests.

## Activation

At verification completion the existing LAN process still used default 8.
Activation must use clean committed primary worktree `npm run local:lan`.
Do not imply a restart of active synchronous image calls is interruption-free.
Final candidate identity is recorded by `/api/version` and the ignored local
activation receipt; task code completion alone is not runtime activation.
