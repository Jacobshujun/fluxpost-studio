# Production coexistence preparation - 2026-10-27

## Latest: explicit resume succeeded

User explicitly requested resume again after the prior tool denial. A new normal
Start-Process invocation succeeded without changing any client/security setting.
Hidden PID 37572 runs the original b7f2674e... manifest. At 03:04:20Z status=running,
two workers, pacing=4,194,304 bytes/s, 30,184 loaded verified receipts, 398 reused
after current source/target HEAD checks, zero errors/retries/new uploads so far.
The count is progress in this attempt, not loss of prior 117.90 GB copies.
One lock, no STOP marker; actual process command line confirmed as bulk runner.
Workbench /api/version remains cba71dc; effective config provider=tos,
TOS_ENABLED=true, OSS_ENABLED=false, unchanged. No app restart or cloud deletion.
Progress remains in ignored data/oss-migration/progress.json. This is not complete;
source still live and final delta/cutover remain separate gates.

Focused resume/bulk tests pass before launch; baseline rerun log is
.tmp-oss-coexist-resumed-baseline.log. The earlier denied-launch notes below are
historical and superseded by this explicit successful attempt.

Rerun baseline: all deterministic domains pass, then the same 17 existing ignored
runtime-script lint errors / 17 warnings stop the command; no gate weakened.
Context budget and diff check pass. At 03:06:36Z (11:06 CST), 3,246 objects' prior
hash proofs revalidated, zero failures; process alive and workbench identity
unchanged. Code fingerprints saved beside the attempt journal. No commit, app
activation, extra migration job or new task scope in this resume turn.

User requires migration and content production concurrently. Do not stop/restart
the workbench, switch TOS to OSS, freeze writes, modify queues or start paid model
tasks on their behalf. Source remains live; delta inventory/cutover approval later.

## Actual state

Prior attempt PID 33960 stopped with ECONNRESET at 2026-10-27T02:06:12.554Z,
4,000 objects reverified, zero newly uploaded. No active migration lock/STOP marker.
Earlier same-job receipts contain 30,184 SHA-256 verified files / 117,899,533,182
bytes; these are historical proofs, not a fresh complete inventory.

After implementing/testing coexistence changes, the tool environment rejected the
Start-Process launch invocation with "blocked by policy" before execution. No
new background migration was launched and no new uploads were made this turn.
Do not bypass that restriction or report a running job. Read-only follow-up still
shows the old failed attempt and no lock. Restore execution availability via normal
operator/client controls before any relaunch; a second launch was not attempted.

## Changed files/contracts

- bulk-resume.mjs loads successful SHA-256 receipts only from summaries matching
  the same manifest hash/job under the private job directory. It ignores nonverified
  entries; malformed journals fail rather than guess at missing progress.
- bulk-core.mjs reuses a full prior hash proof only after live source conditional
  HEAD confirms manifest ETag/modified time/size, live target HEAD has the exact
  prior target ETag/size, and source/target supported metadata match. Unchanged
  checkpoints avoid full downloads; invalid proofs require full hashing. Source
  mutation, collision or metadata mismatch still fails. ETags are change tokens,
  not portable hashes or cryptographic proof against malicious provider mutation.
- bulk-migrate.mjs keeps the same immutable manifest/lock, now two workers and a
  shared 4 MiB/s aggregate admission budget across source GET, part upload and
  target readback. This spaces payload requests; it is NOT an OS traffic cap and
  8 MiB requests may burst. Metadata checks still consume requests/resources.
- Retry only idempotent HEAD/GET/uploadPart for explicit ECONNRESET/timeout/socket
  codes or 408/429/5xx; max 3 calls, 1s/3s backoff, sanitized retry events/counter.
  Unknown RequestError alone is not retried. Never automatically retry init/complete,
  403/409/412, metadata/hash mismatch, or journal persistence failures.
- New counters distinguish checkpointReused/retries from newly hashed/uploaded.
  Receipts are revalidated every attempt; final frozen/delta audit remains required.

## Verification

New test was red before implementation; migration_resume_check.mjs passes same-job
receipt loading, invalid proof rejection, payload pacing, idempotent-only retry cap,
nonretryable authorization/collision/integrity errors, and error redaction.
bulk_migration_check.mjs passes matching/stale proof, source/metadata mutations,
no-overwrite, SHA-256, 8 MiB multipart, journal, lock, STOP and two-worker bounds.
TypeScript and changed-file ESLint pass. Full baseline deterministic domains pass,
then the same existing 17 ignored-runtime-script lint errors / 17 warnings block.
Evidence: ignored .tmp-oss-coexist-baseline.log. No application code changed.

## Next

Do not claim simultaneous execution until a new progress.json PID is alive with
concurrency=2, pacing=4194304, nonzero checkpointReused and advancing counters.
Keep workbench TOS configuration unchanged and verify health before/after launch.
No new commit, push, application activation or production deployment performed.
