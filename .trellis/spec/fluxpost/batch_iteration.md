# Batch iteration failure diagnostics

V2 schedule child/shared stages expose compact latest-attempt `iterationSummary` /
`sharedIterationSummary` during terminal reconciliation. Summary indexes are
one-based positions in the iteration input array, after upstream image selection;
do not describe them as original source positions after reordering. Never copy
full image outputs/inputs into schedule summary fields.

Both batch-create result records and the Canvas runtime tree render the shared
`ScheduleIterationFailures` component. Load details only on explicit expansion or
refresh for a single main/child/phase scope. Do not fan out detail requests for a
50-group batch or add background detail polling. Old failed records without new
summary fields must still offer the lazy details entry.

`GET /api/canvas/schedules/{id}/iterations` requires workspace authentication and
`mainTaskId`, `phase=child|shared`, and `childTaskId` for child phase. Validate
schedule ownership, run ownership, exact V2 batch context, and each image run's
owner/parent/region/item identity. Detail responses contain source/status/error
and failed inner-node labels, without model configs or result output payloads.

Optional `iterationNodeId` on child/shared retry selects one failed region.
Persist child selection with `retryPending` / `retryIterationNodeId`, revalidate
when activating, then clear the target. Existing iteration failure reset owns
safe image retry targets, reuse of successful image/analysis results, admission,
leases and revision handling. No automatic provider retries. Existing whole-result
and bulk retry commands remain valid. Shared outputs already delivered to child
tasks stay frozen; downstream/published refresh remains explicit and guarded.

Keep iteration `all` versus `at-least-one` separate from schedule aggregation.
Strict regions wait for all images before delivering output; accepted partial
regions may produce fewer images. An error in one result does not justify hiding
it, changing policy automatically, or restarting successful groups. Independent
groups retain existing scheduling behavior.

Aggregate-stage failures are separate from child/shared failures. Reconciliation
sets `aggregateRetryable` and `aggregateFailedNodeLabel` on the main task even when
all child results succeeded. Both result views show the group-stage retry button;
bulk retry includes eligible aggregate failures. `retry-main` persists
`aggregateRetryPending` before dispatch, retains mainRunId/generatedPostId/child
results, revalidates run/owner/batch identity and retries only the failed node and
necessary descendants. Reject running, published and external-write plans.
Composition reuses its previous post artifact, updating the same unpublished post
without regenerating successful inputs. Do not treat terminal children as proof
that all work in the aggregate run succeeded.

Operator repair helpers must match the managed runtime configuration and remove
an inherited `NODE_TLS_REJECT_UNAUTHORIZED=0`, as the launcher does. If provider
bytes were retained after storage failure, recover/verify those bytes and persist
their proven output before resuming composition; do not pay for another image
or mark a failed node successful without verified media. Retain local recovery
backups outside Trellis and never commit generated media or provider payloads.

Checks: `canvas_schedule_iterations_check.mjs`, region retry cases in
`canvas_scheduler_check.mjs`, existing iteration runtime/actions/queue checks.
Browser: `powershell -ExecutionPolicy Bypass -File
.trellis/verification/batch_iteration_browser_checks.ps1` (50 groups, both result
views, shared scope, desktop/mobile, all API/media intercepted). Evidence:
`11-16-batch-iteration-failures/verification.md` in task/archive storage.
