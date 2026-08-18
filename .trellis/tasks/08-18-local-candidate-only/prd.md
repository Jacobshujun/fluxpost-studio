# Consolidate local candidate runtime

## Goal

Keep one local application runtime only: a versioned candidate built from the
clean committed `HEAD`. Remove the separate dirty-worktree development preview
so local operation has one startup command, one worker policy, and one
traceable code identity.

## Background

- FluxPost is a personal local application; the operator does not need parallel
  development-preview and candidate runtimes.
- Port `3001` remains the only local application port.
- The current development preview can accept durable Feishu work while its
  Feishu worker is disabled, leaving the UI polling a job that cannot run.
- The existing candidate startup already requires a clean worktree, builds the
  current full Git SHA, enables normal background-worker behavior, replaces the
  port-3001 listener, verifies `/api/version`, and runs an HTTP smoke check.
- Local configuration, PostgreSQL/SQLite data, queues, generated media, and
  accounts are runtime state and must not be deleted or versioned by this work.

## Requirements

- R1: `npm run local` is the canonical and documented local application entry.
- R2: The canonical entry starts only the versioned candidate behavior: clean
  committed `HEAD`, production build, normal background workers, full-SHA
  identity, port replacement, health check, and HTTP smoke.
- R3: The default candidate binds to `127.0.0.1:3001`. A documented LAN entry
  may bind the same candidate SHA to `0.0.0.0:3001`; this is a network-access
  variant, not a second runtime version.
- R4: Remove the hot-reload development-preview entrypoints and their dedicated
  scripts/configuration, including the opt-in development worker mode.
- R5: Keep `npm run local:restart` and any retained LAN command only as
  compatibility aliases to the same candidate script; they must not represent
  a second runtime mode.
- R6: Preserve the current whitelist/accounts authentication modes, account
  management, `admin`/`operator` roles, owner isolation, and session behavior.
- R7: Do not change business features,
  provider credentials, database rows, queue rows, media, or production
  deployment behavior.
- R8: A bug fix must be verified and committed before it can replace the local
  candidate; candidate startup must continue to reject dirty worktrees.
- R9: Update active README/Trellis facts and deterministic checks so no active
  guidance or package command advertises a local development-preview runtime.
- R10: Preserve the one-port invariant; startup must continue replacing only the
  listener on port `3001` and must not create another worktree or app instance.

## Acceptance Criteria

- [x] AC1: `npm run local` builds and starts a clean committed full-SHA candidate
  on `127.0.0.1:3001`, exposes `mode="candidate"`, `versioned=true`, and the
  exact `HEAD` through `/api/version`.
- [x] AC2: `package.json` no longer exposes an application hot-reload or
  development-preview command; any retained local alias resolves to the same
  candidate script.
- [x] AC3: The obsolete development launcher/restart scripts and
  `FLUXPOST_DEVELOPMENT_WORKERS` contract are absent from active code, docs, and
  verification.
- [x] AC4: Candidate background workers retain normal enabled behavior; the
  startup script does not inject `FLUXPOST_DISABLE_BACKGROUND_WORKERS=1`.
- [x] AC5: Startup still refuses an uncommitted worktree before stopping the
  current port-3001 listener.
- [x] AC6: Active documentation describes one personal local candidate runtime
  and does not instruct users to run a second local version.
- [x] AC7: The LAN command uses the same candidate script and invariants while
  changing only the bind host to `0.0.0.0`; it does not start another port or
  runtime mode.
- [x] AC8: Workspace account and permission checks remain unchanged and pass.
- [x] AC9: Focused runtime checks and the complete deterministic baseline pass
  without live Feishu, model, crawl, or other provider calls.
- [x] AC10: Existing local runtime state and production deployment files remain
  unchanged.

## Out Of Scope

- Changing application features or the `admin`/`operator` permission model.
- Migrating, replaying, cancelling, or deleting existing runtime tasks.
- Changing the remote production deployment or parity workflow.
- Adding a second local port, worktree, container, or runtime-data copy.

## Technical Notes

- `next start` remains an internal package command used by candidate startup and
  production deployment; it is not a second documented local application mode.
- The deterministic isolated smoke server may retain an internal unversioned
  test identity with workers disabled. It is not a port-3001 user runtime.
