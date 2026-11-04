# Local heap exhaustion investigation — 2026-11-04

All incident times below are Asia/Shanghai. Read-only investigation; no
application source, runtime configuration or business data changed. The
existing server was not restarted and no external provider calls were made.

## Confirmed failure mechanism

Both retained native reports say `trigger: OOMError` and
`Allocation failed - JavaScript heap out of memory`. Matching stderr says
`Ineffective mark-compacts near heap limit`. Both child exits are code 134.

| Server PID | Started | Exited | Runtime | Slot |
| --- | --- | --- | --- | --- |
| 3288 | Nov 3 22:53:14 | Nov 4 09:35:52.964 | 10h42m39s | .next-local-a |
| 25636 | Nov 4 09:40:07 | Nov 4 10:13:15.042 | 33m08s | .next-local-b |

Both ran Node v24.12.0 and commit
`52d761bf01854071f048e80210855c4c6294649e`.

- Used JS heap: 4,286,664,040 and 4,290,574,712 bytes (~4.0 GiB).
- Reported V8 heap limit: 4,496,293,888 bytes (4288 MiB).
- Old-space objects alone: 4,252,739,504 and 4,254,809,032 bytes.
- External memory: ~71–72 MiB. Fatal reports show predominantly JS objects,
  rather than several GiB of external image buffers.
- System free RAM: 81,558,388,736 and 81,774,170,112 bytes (~76 GiB).
- Last full garbage collection left 4088.1 / 4091.8 MiB allocated.

This establishes process-level JavaScript heap exhaustion, not host RAM
exhaustion. It does not by itself prove a persistent leak versus a large live
request graph. Native reports have no JavaScript stack (`Unavailable.`).

Raw reports remain ignored under `data/local-diagnostics/reports/`:
`report.20261104.093552.3288.0.001.json` and
`report.20261104.101314.25636.0.001.json`. Matching supervisor logs are the
Nov 3 14:53:14Z and Nov 4 01:40:07Z segments under `logs/`. Use the
supervisor ISO UTC timestamps converted to Asia/Shanghai for chronology:
the Windows native header's clock text carries an inconsistent `Z` suffix.

## Concrete high-memory code path

The authenticated `GET /api/canvas/runs?workflowId=...` route calls
`listCanvasRunHistory` (`src/lib/canvas/runs.ts:419`). The editor calls this
when loading a workflow (`src/app/canvas/page.tsx:553,1388`).

`listCanvasNodeRunsForWorkflowFromDb` (`src/lib/database.ts:3893`) joins all
historical node executions to their parent runs, selecting BOTH full JSON
documents for EVERY node row, without a limit or latest-per-node SQL filter.
The caller deduplicates in JavaScript only after all rows have been parsed.
It then calls `listCanvasSuccessfulNodeRunsForWorkflowFromDb` (line 3923),
which repeats the unbounded join for successful output statuses. The latter
is also used by prior-output reuse in `src/lib/canvas/runs.ts:140`.

The separate 50-run list limit does not bound these two queries.

Read-only SQL aggregates against the local database, around 11:14–11:16:

| Largest workflow history | Value |
| --- | ---: |
| Parent runs | 21,788 |
| Joined node rows | 171,092 |
| Distinct node IDs | 25 |
| Successful-status rows | 159,206 |
| Unique parent-run JSON text bytes | 390,758,900 |
| Parent-run JSON text bytes after join duplication | 3,130,227,890 |
| Node JSON text bytes | 613,101,886 |
| Combined first-query JSON text bytes | 3,743,329,776 (~3.49 GiB) |

The Node PostgreSQL driver parses each returned JSON value. This path
therefore materializes a very large object graph before reducing it to at
most 25 latest-node entries. JSON byte totals are not measurements of JS
heap usage; object overhead, row storage and concurrent work can add further
memory pressure. The second query repeats much of the work.

Only server-side aggregate counts/sizes were read: this investigation did
not execute the multi-GiB result query or request that authenticated endpoint
against the active application. No user payloads or identifiers are recorded.

This is a confirmed unbounded allocation risk and the leading code-path
candidate. It is NOT proof that either historical crash was caused by this
endpoint: request access logs and an allocating JS stack are absent. The
largest workflow had node updates at 09:53:38, which proves same-day use but
does not prove a history request at either crash time.

## Correlation and exclusions

- Activity records include normal generation/review/publishing that morning.
  The latest retained event before the second crash is successful Feishu
  publishing at 10:12:10.692. Temporal proximity alone does not establish
  Feishu as the fatal allocator. No matching retained business events appeared
  in the 09:30–09:36 window; activity logs are not HTTP access logs.
- Recent 100 scheduler documents total only 7,413,360 JSON bytes. The scheduler
  query is limited to 100; it must not be described as loading all 1542 rows.
- Old running/waiting queue records exist, but status age alone does not
  establish current execution or the crash cause. No queue records changed.
- Several prior `Failed to find Server Action "x"` messages occurred in the
  first run; the second crash does not need that warning. They are not the
  fatal error evidenced by either report.

## Current runtime and next repair

Existing PID 4680 started at 11:10:44, listening on `0.0.0.0:3001`.
`/api/version` returns the same full SHA, `mode: candidate`, `versioned: true`.
Observed process working set varied (~0.38–1.62 GiB) during investigation;
these are OS process metrics, not live V8 heap measurements. Continued
availability does not establish that the allocation risk is fixed.

Prioritize database-side latest-per-node projection for history and reuse:
preserve latest-attempt/successful-output semantics, ownership, ordering,
iteration exclusions and older reusable output behavior. Select necessary
run/node fields and avoid repeating full graph snapshots. Verify with a
large isolated workflow-history fixture, SQLite/PostgreSQL behavior and the
existing history/reuse regressions. A blind recent-N cap could discard the
last valid output of an older node. Raising heap size alone leaves growth
with retained history unbounded.

For conclusive attribution of a future incident, add bounded, sanitized
route/query timing and heap counters around the implicated calls; avoid
user payloads, public diagnostics endpoints, production heap dumps, or
replaying paid work. Any source fix must pass verification and be committed
before a managed local activation, as required by AGENTS.md.

## Verification

Documented full offline baseline passed with `TRELLIS_SMOKE_PORT=45678`:
deterministic checks, lint (0 errors / 16 existing warnings), TypeScript,
production build, built configuration synchronization, HTTP smoke and SQLite.
Local log: `test-artifacts/local-heap-crash-20261104/baseline.log`.
`git diff --check` passed. This fixture-based baseline does not cover the
multi-GiB real history query and does not establish crash resolution.
