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

- Commit `5d1d0c4e1513d09d9709a27a0d7962a7d709f276` preserved the audit artifacts
  and recovery evidence. `git status --porcelain` was empty before activation.
- `npm run local:lan` built `.next-local-a` and passed release identity and the
  existing HTTP smoke. Log: `test-artifacts/local-startup-recovery-activation-20261103.log`.
- After the activation command exited, port 3001 still listened on `0.0.0.0`.
  `/api/version`, Git HEAD, state receipt and the slot manifest all matched.
- `/`, `/review` and `/content` returned HTTP 200 on loopback and the machine's
  LAN address. This does not establish reachability from another device.
- The installed desktop LAN launcher with `-NoBrowser -NoPause` took its
  "application already running" path and returned exit code 0.

Final task archival changes only documentation. After committing the archive,
reactivate from clean HEAD so the running candidate also includes that evidence;
store the final activation output in
`test-artifacts/local-startup-recovery-final-activation-20261103.log`. The ignored
candidate receipt and `/api/version` identify the final running SHA.

This resolves the startup rejection and restores service. It does not prove or
fix the original unexpected exit cause. No application/launcher code or live
configuration was changed, and no publishing retry was submitted manually.
