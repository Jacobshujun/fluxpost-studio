# Local OSS Cutover Contract

## 1. Scope / Trigger

Operator-approved local TOS to OSS migration. Production and source deletion require
separate authorization. User secrets and runtime evidence remain ignored.

## 2. Signatures

`npm run migrate -- status|logs|refresh|continue`; refresh/continue require interactive
confirmation or explicit `--yes`. Legacy copy is under `npm run migrate -- copy`.
Configuration: data/oss-cutover/config.json with version 1, evidenceDir,
onlineBackupDir, frozenBackupDir (workspace-contained, canonical paths).

## 3. Contracts

Default status reads dated receipts plus local runtime identity, never starts a copy.
Continue uses an exclusive lock and sequential preflight/freeze/backup/inventory/
delta/verify/references/config/activate/acceptance. Candidate tree must be clean;
activation uses the primary-worktree standard launcher. Database changes are one
transaction with durable reverse patches and before/after hashes. Replace only
verified exact source URLs; preserve unknown/signed/missing links and numeric JSON.
Config points to official OSS endpoint and keeps TOS settings. No paid model or
publishing acceptance; admin probe creates and removes only its own health objects.

## 4. Validation / Errors

Dirty tree, active leases, provider recovery, uncertain process identity, stale
inventory, collisions, missing backup or earlier interrupted transaction stop work.
Delta cap is 500 objects/512 MiB and 64 MiB per item; exceeding it stops before
writes. Operator-reviewed splitting preserves caps and hash checks. Interrupted
locks/transactions are not automatically removed or retried. Ctrl+C stops after
the active phase, never means rollback. New post-switch writes require reconciliation
before rollback; do not simply replace the whole DB with an old backup.

## 5. Cases

Good: frozen inventory, scoped split delta, per-object verification, complete
transaction, exact core-data preservation, clean activation and live acceptance.
Base: status shows old snapshot timestamps and pending phases, without claiming
live synchronization. Bad: re-run bulk start, overwrite unknown objects, or turn
unknown TOS references into known-missing OSS addresses to make counts look clean.

## 6. Tests

storage_cutover_cli_check.mjs: confirmation, locking, interruption, clean tree,
redaction, paths and ordered fake execution. storage_reference_rewrite_check.mjs:
exact URL matching, signed/missing preservation, numeric precision and reversal.
Real TEMP PostgreSQL and live cutover evidence are task-specific, not default tests.

## 7. Wrong / Correct

Wrong: treating a completed cloud-copy report as full application cutover or source
deletion approval. Correct: independent database/config/activation receipts and
core-library/copy checks; retain source and document remaining history/production.
