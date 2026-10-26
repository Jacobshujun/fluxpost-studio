# Implementation checklist

- [x] Read startup/spec contracts and identify existing OSS changes.
- [x] Create approved task; persist requirements/design/checklist.
- [x] Add and test pure historical evidence adapters; no runtime ingestion yet.
- [x] Verify producer/history adapters, fallback/direct-original exclusion, partial
  outputs and ownership propagation before coding ingestion.
- [x] Dual-backend schema, generated index/links, atomic insert, exclusions, retry
  receipts and resumable progress.
- [x] Typed evidence adapters, bounded backfill and authenticated progress API.
- [x] Automatic per-output enrollment after successful persistence.
- [x] Shared SQL/parser/filter/smart-folder extension and stable pagination.
- [x] Safe local thumbnails and generated-only removal behavior.
- [x] Gallery entry/filters/provenance/status and manual single/batch vehicle edits.
- [x] Normal Canvas and batch selector changes, normalization and frozen snapshots.
- [x] Isolated dual-backend regressions and three-theme desktop/mobile checks.
- [x] Focused checks and full baseline; distinguish unchanged blockers.
- [ ] Confirm commit plan; stage task-only hunks; commit verified changes.
- [ ] Activate only if the primary worktree is clean; no remote deployment.

## Existing verification commands

```powershell
node .trellis/verification/unified_library_runtime_check.mjs
node .trellis/verification/library_ui_check.mjs
node .trellis/verification/canvas_scheduler_check.mjs
npx --no-install tsc --noEmit
npm run lint
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

Add focused commands only after scripts exist. PostgreSQL tests use temporary
schemas; browser fixtures intercept APIs on worker-disabled smoke servers, not
3001. No paid calls, real backfill, cloud writes or publication in checks.
