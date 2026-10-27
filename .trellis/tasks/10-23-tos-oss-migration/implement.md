# Execution

- [x] Read startup facts; protect secret in local Git exclude before research.
- [x] Create and review PRD/design/plan; user explicitly requested this phase.
- [x] Add repository ignore and container-context exclusion; inventory runtime identity,
  storage boundaries, database reference domains and source/target access read-only.
- [x] Add explicit provider selection, separate OSS configuration and SDK adapter.
- [x] Update all direct enabled checks; preserve TOS defaults and legacy contracts.
- [x] Add deterministic adapter regression and register in baseline.
- [x] Run focused checks, TypeScript, tracked-source lint, build and project baseline:
  `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`.
- [x] Record evidence, update lightweight status and feature state; leave migration
  incomplete with precise next-phase gates. Do not commit/restart/deploy implicitly.

2026-10-26: source/target current-object lists now pass after fixing empty signing
parameters and OSS V4. Preserve 18,580 existing target objects. Production inventory,
managed-service guide review and browser delivery remain pending; see verification.md.

## Integration and commit authorized 2026-10-26

- [x] Preserve committed Qwen node 0b775c7 and generated library bbe4ff9.
- [x] Recover eight-object local-script trial evidence without uploading again.
- [x] Verify MP4/MOV browser playback and byte ranges with strict TLS.
- [x] Guard trial command with --apply-trial, byte cap and incremental receipts;
  add executable isolated tests to the shared baseline.
- [x] Run integrated baseline, lint, types, build and isolated smoke (known ignored
  runtime lint blocker unchanged; all deterministic domains pass).
- [x] Include remaining OSS work in the user-authorized commit batch;
  no push/restart/full copy/deployment. Exact commit identity is in Git history.
- Keep this migration task in progress: full copy, frozen verification and
  historical-reference migration are still unimplemented, not merely review gates.

## Later gates (not execution approval)

## Bulk run authorized and lifecycle confirmed

- [x] User confirms provider page contains no lifecycle rules; retain this as user
  evidence, not as a successful SDK policy read.
- [x] Build and offline-test bounded create-only bulk runner with durable receipts.
- [x] Refresh inventory, persist immutable runtime manifest, preflight overlap.
- [x] Start monitored bulk copy; see bulk-run.md / data/oss-migration/progress.json.
- [ ] Verify frozen manifest, then perform separately coordinated final delta/cutover.

No cloud deletion, broad target overwrite, database rewrite or storage switch.

2026-10-26 full copy is running after operator lifecycle confirmation. Earlier
preflight gate is historical; use `bulk-run.md` and live progress.json.

## Authorized LAN release

- User requests committing pending changes and updating LAN 3001.
- Preserve Qwen/library/OSS prior commits. Commit bulk scripts, tests and records.
- Run baseline and focused checks; never weaken known ignored-data lint errors.
- Use npm run local:lan from clean primary worktree; no alternate directory/guard bypass.
- Verify full-SHA identity, 0.0.0.0 binding, pages/auth smoke and bulk worker continuity.
- Keep effective TOS config unchanged; no GitHub push or production deployment.
- Keep migration task active until copy/delta/reference work actually completes.

## User-requested memory multipart switch

## Operator CLI requested 2026-10-27

- [x] Add Chinese menu/status/watch/start/stop wrapper; no changes to running worker.
- [x] Add offline temporary-workspace/fake-worker tests for locks, crash/PID safety,
  manifest validation, graceful STOP and safe display; no live start/stop in tests.
- [x] Run baseline/focused/type/lint; validate live status/help only and document
  commands in cli-guide.md. Baseline hits known 17 ignored-script lint errors.
- Real PID 37572 later stopped EPERM (no real STOP/kill sent by CLI tests).
  CLI reports this correctly; no automatic restart or cutover performed.

Newest 2026-10-27: subsequent explicit resume succeeded. PID 37572 running
two-worker paced migration with receipt revalidation and bounded retries.
Prior launch denial is historical. See coexistence.md and live progress.json.

2026-10-27 coexistence request: prepared two-worker paced migration, same-job
SHA receipt revalidation and bounded idempotent transient retries. Offline tests,
types/lint pass, baseline hits known ignored-script lint blocker. Background launch
was rejected by tool policy; NOT running. See coexistence.md before continuation.

2026-10-27: user authorized another resume after RequestError at 30,184 verified
objects / 117.90 GB. Failed object copied and verified once; unchanged runner
restarted on original manifest as PID 33960. Full revalidation before completion;
live progress and detailed evidence are in memory-multipart.md/progress.json.

- [x] Inspect old worker: status failed, ABORT_ERR, 8,086 verified / 25.16 GB;
  process and exclusive lock absent. No concurrent writer to stop.
- [x] Replace disk staging with 8 MiB conditional ranged TOS reads and OSS
  multipart parts; eight workers; preserve full SHA/metadata verification.
- [x] Offline suite and real one-part/multi-part object checks pass.
- [x] Resume original manifest with safe exclusive lock; existing objects get
  full hash check, not size-only skip.
- [x] Monitor live start; do not claim full migration on first resumed snapshot.

1. Resolve public domain/TLS and test actual image/video GET, HEAD, Range and previews.
2. Review both environment inventories; trial copy with same keys and content hashes.
3. Full copy and verification; approve final write freeze and backups.
4. Rewrite exact historical references transactionally, including frozen snapshots,
   validate previews/downloads/Feishu materialization; configure local candidate.
5. Separately approve production exact-SHA deployment/config switch; verify parity.
6. Retain source at least seven days; deletion is a separately approved operation.
