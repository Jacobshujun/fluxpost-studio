# Execution plan

## Stage A: planning and read-only acceptance

- [x] Obtain task-creation consent and confirm intentional concurrent updates.
- [x] Record report evidence, requirements and operational boundaries.
- [x] User reviews this plan and approves Stage A execution; only then start task.
- [x] Load trellis-before-dev and targeted storage/security/verification specs.
- [x] Recheck git status/runtime identity and baseline scope without printing secrets.
- [x] Implement/reuse bounded read-only inspection with isolated negative tests for
  scope, byte limits, redaction and no cloud writes before using live credentials.
- [x] Perform sample delivery checks (maximum eight objects, 32 MiB body budget).
- [x] Collect source/target scoped inventories and compare against dated reports.
- [x] Discover local reference scope with dedicated read-only DB access if available.
- [x] Record aggregate evidence, coverage gaps and provisional delta; update status
  to distinguish completed managed copy from stopped historical local worker.
- [ ] Present findings and a concrete cutover/rollback proposal for separate approval.

## Stage B: separate approval required

- [ ] Finalize exact runtime/config/reference mapping and rollback based on Stage A.
- [x] Obtain explicit approval for task drain/freeze, backup, delta copy, database
  reference updates, config changes and local activation; do not bundle production.
- [ ] Back up current database/config and verify restore usability without touching
  the active database. State any missing restore-drill permissions before proceeding.
- [ ] Copy only approved delta and verify final frozen set; no blind overwrites.
- [ ] Apply reversible scoped reference/config changes; validate old and new media.
- [ ] Verify and commit any code fix before clean primary-worktree local activation.
- [ ] Run approved authenticated local acceptance; no paid generation/publishing
  unless separately authorized. Keep TOS >=7 days and track post-switch writes.

### 2026-10-28 execution checkpoint

- [x] Private online database dump and .env.local copy; full archive decode passed.
  Restore drill unavailable because the application role lacks CREATE DATABASE.
  This is not the final write-frozen backup.
- [x] Fresh inventory identified 185 missing objects / 263,731,668 bytes. One-shot
  create-only copy through tested copyOne completed with 185 SHA-256/metadata
  receipts, zero failures. Old bulk worker was not restarted.
- [x] Post-copy live listings: 71,585 media keys in each provider, zero missing,
  extra or size-mismatched media keys. OSS's two report files excluded.
- [x] Current ordinary library: all 2,301 object keys present in source inventory;
  public URLs map exactly to object keys.
- [ ] Resolve preservation policy for old references absent from BOTH inventories
  before writing database mapping. Do not rewrite these to known-missing OSS URLs.
- [ ] Quiesce actual workloads, refresh backup/inventory and execute reviewed mapping.

No runtime configuration, database references, task states or listener were changed.

## Verification

Planning checks: JSON validity and git diff --check; do not call live services in
planning. Before implementation completion run the existing baseline:

```powershell
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

Keep the known ignored-script lint failure visible; never weaken gates. If still
present, isolate it and run remaining documented checks explicitly. Baseline must
not access live storage; report bounded cloud acceptance separately. Do not claim
current baseline success based on earlier runs. Raw reports remain ignored.
