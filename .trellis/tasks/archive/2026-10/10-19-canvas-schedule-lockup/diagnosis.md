# Canvas batch scheduling incident: diagnosis and proposal

Date: 2026-10-19. Times below are Asia/Shanghai.

## Confirmed observations

- The reported batch is the video-processing copy with suffix `20261019-093318`. It has 38 main tasks: 30 completed with generated-post references, eight still running in their shared collection phase. Completed run records include shared, child and aggregate phases; they must not be confused with 90 completed main tasks.
- Those eight collection nodes started at 09:47–09:48. Their queue leases stopped renewing at 09:48 and expired around 09:58. Their recorded worker PID is absent. The current 3001 listener started at 09:50 with a different PID; the reason for that process replacement is pending confirmation.
- All eight runs have cancellation requests around 11:10:38 but remain running. The schedule also remains running.
- At the 11:14–11:20 read-only observations, 70 Canvas queue rows were running: 62 expired leases and eight live leases. Historical stale rows predate this incident and do not consume current in-memory worker slots.
- All eight live slots are at `utility.image-process`: four per-image iteration children since about 11:00 and four shared runs of another batch since about 11:09. Heartbeats keep extending these leases despite no recorded node completion. Seven queued runs belong to two newly launched batches, including six for a newer video-processing batch. New work can be persisted but is not being executed.
- `/api/version` returned HTTP 200 in approximately 3 ms and matched local HEAD/candidate identity. PostgreSQL had ten idle application connections and no blocking sessions at observation. Neither whole-process lockup nor a database blocking lock is supported by that evidence.

## Confirmed code defects and limitations

1. `src/lib/database.ts`: `claimNextCanvasRunQueueItem` only claims queued rows. Ordinary expired running rows have no general recovery path. `requeueExpiredCanvasRunQueueItemsWithProviderTasks` requires a saved provider task ID; `recoverCanvasIterationRuns` is scoped to iteration graphs/children. Ordinary collection runs satisfy neither recovery path.
2. `src/lib/canvas/runs.ts`: eight Canvas workers are the default. A worker remains occupied while awaiting node execution or an in-memory resource pool. The heartbeat checks lease ownership/status, not node progress or a run deadline.
3. `src/lib/concurrency.ts` and `src/lib/canvas/image-process.ts`: `localImage` is globally limited to one and shared with other image operations. Its callback covers source reading, encoding, cache/file operations and persistence/upload. Pool acquisition has no deadline/cancellation, and the full image operation has no end-to-end deadline. HTTP source materialization does have a 120-second timeout, so it would be inaccurate to claim that every download lacks a timeout.
4. `cancelCanvasRun` records a request for running work; it does not interrupt the running executor or remove its pending pool acquisition. Cancellation is checked between node execution rounds. A hung callback or an expired run without an executing worker therefore cannot acknowledge cancellation. Scheduler reconciliation also lacks a cancellation-intent guard and can project still-running children back over a cancelled schedule; this risk is established by inspection, not a new live mutation experiment.
5. V2 launch prepares all shared main-task runs immediately. Queue claiming orders by priority then creation time, with no per-schedule fairness reservation. Many tasks waiting on one resource can exhaust the global execution slots.

## Remaining uncertainty

- Concurrency is a plausible stress trigger, but existing evidence does not establish what originally stalled collection or why the earlier process exited/restarted.
- The exact await holding the image resource is pending confirmation: source reading, native Sharp processing, filesystem/cache work, another caller sharing the pool, or storage persistence. Node rows do not record these substeps, and the running process exposes no pool snapshot endpoint. No production request, debugger attachment, provider retry or paid generation was used to guess the answer.
- This is execution starvation and stale state, not proof of a circular-lock deadlock. Browser-specific inability to click/create was not reproduced with an authenticated browser; persisted newer launches establish that submission itself can succeed.

## Recommended recovery, not executed

1. Snapshot only the affected records through a scoped, local recovery tool; preserve all 30 completed main tasks and their output/publish receipts. Inventory current eight live image runs and queued work before interruption.
2. Pause admission of the affected live/queued work during recovery. After confirming owner/lease expiry, terminalize the eight abandoned collection runs and queue rows according to their already-persisted cancellation intent, and reconcile the parent. Merely cancelling this old batch cannot release the current process's eight image workers.
3. Release the current stuck image executions using a controlled restart when a bounded abort path is unavailable. Activation must follow the existing clean committed HEAD / `npm run local:lan` protocol, preserving the LAN binding. A restart alone is incomplete: currently running ordinary image tasks can themselves become abandoned rows unless explicitly handled by the recovery tool or repaired recovery code.
4. Resume one small batch first. Keep optional retries explicit, limited to failed/uncompleted phases. Do not replay completed aggregate/publishing phases or bulk-requeue historical expired rows. Wider historical stale-row cleanup is a separate reviewed scope.

## Permanent repair proposal

- General expired-lease reconciliation at worker startup and normal queue admission. Honor cancellation first; transition interrupted ordinary work to an explicit recoverable terminal state. Resume provider tasks only from persisted task IDs. Do not silently replay side effects.
- Cancellable pool acquisition plus executor abort/deadline propagation. On cancellation, remove pending acquisitions and actually stop cancellable I/O/child work before releasing slots. A bare `Promise.race` that leaves the underlying task running is insufficient. Isolate native image processing in terminable workers/processes if it cannot be interrupted safely.
- Limit the image CPU pool to encoding; independently bound download/upload operations. Record resource-wait states durably and park waiting runs instead of occupying every Canvas worker. Add per-schedule bounded admission/fair claiming, including shared stages. A provisional per-batch admission limit of two can be evaluated; do not simply raise worker or image limits.
- Preserve cancellation intent during schedule reconciliation. Expose waiting resource, elapsed step time, lease owner and active/queued pool counts to authorized diagnostics/UI.
- Regression scenarios: ordinary expired collection/image runs, cancellation of expired work and pool waiters, no resurrection of cancelled schedules, all slots waiting on a resource with another batch queued, stalled native worker termination, restart reconciliation, and no duplicate publishing of completed work. Use isolated fixtures, not real provider calls.

## Verification

- Read-only diagnostics used the configured diagnostic role inside `BEGIN READ ONLY`; no runtime writes or candidate restart were performed.
- Full existing baseline executed with `TRELLIS_SMOKE_PORT=45678`. All deterministic checks before lint, including image processing, concurrency, Canvas scheduler and iteration checks, passed. Baseline then failed at the known 17 ESLint errors in ignored `data/feishu-copy-import` scripts (17 warnings also reported). TypeScript/build/HTTP-smoke stages after lint were not reached in this run. No application code changed, so no separate build was run.
- Local ignored evidence: `.tmp-canvas-schedule-lockup-baseline.log`. No new runtime snapshots, credentials or media URLs are stored in this report.

Outcome: analysis complete; recovery and implementation remain proposed and unexecuted.
