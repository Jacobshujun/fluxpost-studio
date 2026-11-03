# Local server diagnostics

## 1. Scope / Trigger

Managed primary-worktree candidate starts and rollback via `npm run local` /
`npm run local:lan`. This records future exits; the historical Nov 3 aborts
remain unexplained without their destroyed fatal output.

## 2. Signatures

- `node scripts/local/server-diagnostics.mjs --check`: writable-storage and
  retention preflight; called before stopping the old listener.
- `node scripts/local/server-diagnostics.mjs <127.0.0.1|0.0.0.0> 3001`: internal
  supervisor, called by `restart.ps1`; use the managed npm entry for activation.
- No package dependency, public API or database change.

## 3. Contracts

- Supervisor directly spawns the existing Next CLI using the current Node,
  environment, slot, SHA, working directory and host/port. Normal workers remain
  enabled. No automatic restarts, task replay, inspector or heap snapshots.
- Ignored `data/local-diagnostics/logs/` contains timestamped stdout/stderr and
  lifecycle segments: each <=10 MiB; <=10 files, <=100 MiB total. Rotation occurs
  on output, including single oversized chunks and quiet repeated startups.
- `current-run.json` atomically records start/exit times, SHA, slot, supervisor
  and server PIDs, latest segment, exit code/signal and diagnostic error code.
  It is not the authoritative `.fluxpost-local-candidate.json` release receipt.
- `reports/` receives native fatal/uncaught Node reports with environment and
  network details excluded. On startup and child exit, retain <=3 reports,
  <=7 days and <=30 MiB total. Native generation can temporarily exceed this
  budget; oversized reports are removed. No periodic polling or memory dumps.
- `supervisor.stderr.log` is overwritten each launch; runtime diagnostics I/O
  failure emits one notice plus a receipt failure notice if necessary. Such a
  failure disables logging for that run without killing the server.
- Reports/logs may still contain local paths or application output. Never
  publish/commit them, expose them through app APIs, or paste raw report bodies
  into Trellis. Preserve only safe derived facts. Node 24 native report writing
  failed for a Unicode directory in a Windows fixture; the actual project's
  diagnostic path is ASCII. Space-containing paths pass.

## 4. Validation & Error Matrix

- Unwritable storage at preflight -> fail before listener replacement.
- Failure after spawning -> notice/receipt when writable; business child runs on.
- Child fatal/normal exit -> drain pipes, record exact exit, prune, exit helper.
- OS kill/power loss affecting both processes -> final receipt/report may be
  absent. Output retention cannot guarantee capture in those cases.
- Failed health/identity/smoke -> existing candidate rollback path remains.

## 5. Good / Base / Bad Cases

- Good: captured V8 fatal stderr/report explains a new exit 134.
- Base: ordinary output rotates while a long-running server stays alive.
- Bad: call an exit code alone proof of OOM, increase heap without evidence, or
  restart active provider/Feishu tasks just to turn on diagnostics.

## 6. Tests Required

`local_server_diagnostics_check.mjs` is in the offline baseline: oversized
chunks, repeated starts, count/byte caps, report age/count/size, real child exit
134 and lifecycle metadata, a real isolated uncaught-error report with a fake
secret excluded, preflight rejection and runtime I/O failure continuation.
On Windows it executes the actual PowerShell start function with fake HTTP/smoke
and an isolated child, verifying paths with spaces, inherited identity and
continued log/exit capture after the launch shell exits.
`runtime_parity_check.mjs` preserves candidate/rollback/identity contracts.

## 7. Wrong vs Correct

- Wrong: append all output to one forever-growing file or enable heap snapshots.
- Correct: bounded segments plus pruned fatal reports, retaining the exact
  server PID/exit and preserving the clean committed candidate workflow.
