# Local startup recovery evidence — 2026-11-03

## Confirmed diagnosis

The service was not listening on port 3001. The desktop launcher therefore ran
`npm run local:lan`, which rejected three uncommitted Feishu audit artifacts
before any build or listener change. Application source matched HEAD.

The Windows Application log contained five errors in the preceding twelve hours
but none matching Node/npm/FluxPost/PowerShell. No matching Node crash dump was
found. PostgreSQL was running. Server stdout/stderr was not retained by the
existing launcher, so the original process-exit cause remains unconfirmed.

The existing baseline terminates its own isolated smoke child, not arbitrary
Node processes or the port-3001 listener. There is no evidence here that this
baseline stopped the application.

## Verified before activation

- Reviewed the existing Feishu audit report and its sandboxed probe. The probe
  only reads source and supplies in-memory CLI/DB/filesystem substitutes.
- `node .trellis/tasks/11-03-feishu-publish-owner-recovery/review-risk-check.mjs`
  reproduced the same eight previously documented defects. No live writes.
- Full `.trellis/verification/check.ps1` passed with `TRELLIS_SMOKE_PORT=45678`:
  lint, types, production build, config synchronization, isolated HTTP smoke
  and SQLite checks. Log: `test-artifacts/local-startup-recovery-baseline-20261103.log`.
- `git diff --check` passed.

## Activation

Pending clean-tree commit and LAN activation. Do not treat the passing baseline
as proof of a running service or a fix for the original unexpected exit.
