# Root temporary cleanup — 2026-11-03

User authorized cleanup after the read-only inventory. Application code and runtime configuration were not edited; no application restart, external provider call or Feishu write was performed.

## Result

- Root entries: 299 before, 128 retained, 171 removed (8 directories, 163 files).
- Retained root temporary artifacts total 51.72 MiB after cleanup.
- Removed files including directory contents: 61,511; total 1,069.93 MiB.
- Verified recovery ZIP: 2,175 files, 10.81 MiB; net reclaimed 1,059.12 MiB excluding small manifest/log overhead.
- Recovery archive: ignored `test-artifacts/tmp-cleanup-20261103/recovery.zip`.
- Detailed paths, SHA-256 hashes and service snapshot: ignored adjacent `manifest.json`; removal receipt: `result.json`.
- Archive CRC, each member's SHA-256 and unchanged original hashes verified before removal. Rebuildable `node_modules`, `.next`, Python caches and incremental TypeScript caches were omitted from the archive.
- Each deletion target resolved to a direct root `.tmp-*` child; no tracked files, reparse points or active process command references were found.
- Every retained entry remained present after cleanup.
- Port 3001 PID 3516 unchanged; `/api/version` commit unchanged at `93501a29f1cbe08e05340b55f351c2e1564e454c`; `/review` HTTP 200.

## Retention and recovery

Preserved items dated 2026-10-27 onward and storage/migration, video/layer, Gemini/Qwen/text task prefixes. Thus `.tmp-dcd-write` and both storage inventories remain. Old source/data/reference repositories and historical request/response files selected for cleanup are recoverable from the ZIP. Restore only needed entries from the ZIP into their original relative location; avoid overwriting newer files. Old dependency/build caches must be regenerated if their historical copies are ever needed.

The one-off preparation and native PowerShell removal scripts are task evidence, not a scheduled cleanup policy. They intentionally refuse replay against a changed archive/source or already-removed target set.

## Offline baseline

Documented command used with `TRELLIS_SMOKE_PORT=45678`; log: ignored `test-artifacts/tmp-cleanup-20261103/baseline.log`. Exit 0 with `Baseline verification passed.`; isolated HTTP smoke and SQLite checks passed. No 3001 restart was performed.
