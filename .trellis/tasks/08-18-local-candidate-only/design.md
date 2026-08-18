# Consolidate Local Candidate Runtime Design

## Boundary

This change owns local startup commands, their PowerShell implementation,
active documentation/spec facts, and deterministic runtime-contract checks. It
does not alter application features, authentication/authorization, runtime
state, or remote deployment scripts.

## Runtime Contract

`scripts/local/restart.ps1` remains the one candidate implementation:

1. Resolve the project root and exact committed `HEAD`.
2. Reject a dirty worktree before touching port `3001`.
3. Build and confirm the build did not dirty the worktree.
4. Replace the current port-3001 listener.
5. Start `next start` with `FLUXPOST_RUNTIME_MODE=candidate` and the full SHA.
6. Verify health, release identity, and isolated HTTP behavior.

The default host changes from `0.0.0.0` to `127.0.0.1`. The LAN package command
passes `-HostName 0.0.0.0` to this same script. Both commands use the same port,
candidate identity, clean-worktree gate, build, worker policy, configuration,
database, and account system.

## Package Commands

- `local`: canonical loopback candidate command.
- `local:lan`: explicit LAN candidate command.
- `local:restart`: compatibility alias for the loopback candidate.
- `start:lan`: compatibility alias for the LAN candidate if retained by existing
  automation.
- `build` and `start`: internal framework/deployment primitives.
- Remove `dev` and `dev:lan`; delete `start-dev.mjs` and `restart-dev.ps1`.

## Worker And State Behavior

Candidate startup does not set `FLUXPOST_DISABLE_BACKGROUND_WORKERS=1`, so the
normal persisted workers can consume operator-created work. The isolated
baseline smoke continues to disable workers on its private test port. No queue
row is replayed, cancelled, or modified by the implementation or verification.

## Compatibility

The compatibility aliases do not preserve development-preview semantics. They
delegate to the candidate script so old muscle memory cannot accidentally start
a second runtime mode. Production deployment keeps using its existing build and
start primitives and is outside this change.

## Verification

Update `runtime_parity_check.mjs` to assert the candidate-only package contract,
default loopback binding, explicit LAN binding, missing development launchers,
clean-worktree ordering, full-SHA identity, and normal worker behavior. Run this
focused check, account permission coverage, TypeScript, lint, build, and the
complete offline Trellis baseline. A final live candidate restart is performed
only after the task changes are committed, because the script correctly rejects
the dirty implementation worktree.

## Rollback

Revert the task commit to restore the prior development launchers and package
commands. Runtime configuration, data, queues, media, and accounts are not
migrated, so no data rollback is required.
