# Verification — 2026-11-03

## Implemented behavior

- Direct Node/Next child supervision retains stdout/stderr, timestamped
  lifecycle evidence and atomic current-run metadata with actual PID/exit.
- Log segments are capped at 10 MiB each / ten files (100 MiB). Native reports
  retain <=3 / seven days / 30 MiB after startup/child-exit cleanup. Native report
  creation may temporarily exceed that budget. No heap snapshots or heap-limit
  changes, periodic polling, task replay or automatic restart.
- Existing clean-tree, primary-worktree, slot and release-identity/rollback
  guards remain; diagnostic preflight runs before replacing the listener.
- Runtime diagnostic I/O failure records a notice/receipt where possible and
  leaves the business child running. Startup storage failure rejects launch.

## Tests

- `node .trellis/verification/local_server_diagnostics_check.mjs`: oversized
  output, rotation/quiet-start count, report age/count/bytes, real child code
  134, stdout/stderr and lifecycle evidence, real isolated native report with
  environment/network excluded, storage preflight rejection and runtime write
  failure continuation pass.
- Windows runs the actual `Start-CandidateServer` function against isolated
  HTTP/smoke stubs and a harmless child. Space-containing paths, identity/slot
  inheritance and completion logging after the launch shell exits pass.
- `runtime_parity_check.mjs` passes unchanged.
- Changed-file ESLint passes with no warnings.
- Full unchanged baseline passes: context, deterministic checks, lint
  (0 errors / 16 pre-existing warnings), types, build, config sync, HTTP smoke
  on 45678 and SQLite. Log:
  `test-artifacts/local-crash-logging-baseline-final-20261103.log`.
- Native report generation under a Unicode temp directory failed on this
  Windows Node 24 build; the actual project runtime path is ASCII. A native
  report under a space-containing ASCII path passes. This is documented rather
  than hidden behind a report-directory fallback.

## Activation decision

Read-only PostgreSQL preflight used the configured diagnostic reader, in a
`BEGIN READ ONLY` transaction, without revealing connection details or content.
It showed active Canvas queue runs (75), image generation (1), running schedules
(16), plus queued work. Counts are point-in-time observations, not a guarantee
of fresh leases for every row. There is enough ongoing work to defer replacement.

At this check, 3001 listened on LAN via PID 27644, started at 17:35:37; a final
read-only `/api/version` returned `56b22a6bf2811e85e06881bac8513a06a8e5bd71`.
No server
restart or paid/provider/Feishu replay was performed. The implementation is
ready for the next clean-tree `npm run local:lan` once operator work is idle.
Verify `/api/version` equals committed HEAD and the local diagnostics receipt
matches the actual listener after that activation. Existing processes do not
gain report flags until restarted; do not claim logging is already active.

Historical abort causes remain pending confirmation; this change improves the
next incident's evidence and is not a proven fix for the two past exits.
