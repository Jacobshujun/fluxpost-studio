# Consolidate Local Candidate Runtime Implementation Plan

## Checklist

- [x] 1. Update `package.json` so `local` and LAN/compatibility aliases all use
  `scripts/local/restart.ps1`; remove the development-preview commands.
- [x] 2. Change the candidate script default host to `127.0.0.1` while retaining
  explicit `0.0.0.0` LAN binding through a package argument.
- [x] 3. Delete `scripts/local/start-dev.mjs` and
  `scripts/local/restart-dev.ps1`.
- [x] 4. Rewrite `runtime_parity_check.mjs` for the single-candidate command and
  launcher contract, including absence of active development launchers.
- [x] 5. Update active README, AGENTS, status, project brief, rules/decisions,
  verification facts, and feature evidence only where the local runtime contract
  changes; leave historical archives untouched.
- [x] 6. Run focused runtime/account checks, TypeScript, lint, build, and the full
  deterministic baseline without external provider calls.
- [x] 7. Update Trellis task/status evidence, commit the complete change, confirm
  a clean worktree, then run `npm run local` to activate and smoke the exact
  committed candidate on `127.0.0.1:3001`.

## Validation Commands

```powershell
node .trellis/verification/runtime_parity_check.mjs
node .trellis/verification/workspace_accounts_check.mjs
npx --no-install tsc --noEmit
npm run lint
npm run build
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
npm run local
```

## Review Gates

- [x] No active package command or script starts the port-3001 development
  preview.
- [x] Loopback and LAN commands resolve to the same candidate implementation.
- [x] Dirty-worktree rejection happens before build replacement or process stop.
- [x] Normal candidate workers remain enabled; isolated baseline workers remain
  disabled.
- [x] Account and permission implementation is untouched and its checks pass.
- [x] Runtime state and remote deployment files are not changed.

## Rollback Points

- Command/script regression: revert checklist items 1-3 together.
- Contract/spec mismatch: correct items 4-5 before any commit or live restart.
- Verification failure: do not commit or replace the existing port-3001 process.
