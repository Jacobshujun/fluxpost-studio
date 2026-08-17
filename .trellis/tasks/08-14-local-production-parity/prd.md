# Single Local Candidate And Production Parity

## Goal

Use port `3001` as the only local application environment. A clean committed candidate is tested there before it is pushed to GitHub, and production deploys that unchanged full SHA.

## Requirements

### R1. One local environment

- Port `3001` is the only local application port.
- Development preview and committed candidate execution are mutually exclusive on the same port.
- No SHA-specific mirror directory, mirror state file, or port-`3000` environment remains.

### R2. Candidate identity

- A committed candidate runs with mode `candidate` and its full lowercase Git SHA.
- Candidate preparation installs locked dependencies before activation. `npm run local:restart` refuses a dirty worktree, builds before stopping the old listener, starts on `3001`, and verifies its public identity and HTTP behavior.
- Development mode may be unversioned and uses the same port with workers disabled by default.

### R3. Promotion

- GitHub receives only the exact candidate SHA that passed on `3001`.
- GitHub `main` is fast-forwarded to that SHA before production deployment.
- Production deploys only that same full SHA through the installed exact-SHA wrapper.

### R4. Final parity

- The read-only parity command proves equality among the clean local HEAD, the local candidate runtime, GitHub `origin/main`, and remote production.
- Runtime data, databases, queues, media, credentials, configuration, and volumes are never synchronized as code.

### R5. Historical cleanup

- Preserve unique root WIP in `archive/root-wip-20260817` and tag `archive-root-wip-20260817`; exclude it from this release.
- After production verification, retain one local repository/environment and remove other clean worktrees, stale worktree records, and merged or superseded branches.
- Never delete local or production runtime data, generated media, credentials, `.env*`, or Docker volumes.

## Acceptance Criteria

- [x] Port `3001` runs a clean candidate whose runtime SHA equals its worktree HEAD.
- [x] Focused checks, lint, TypeScript, build, and the complete deterministic baseline pass.
- [x] GitHub `main` and production deploy the unchanged tested SHA.
- [x] Final parity reports one identical SHA for local, GitHub, and production.
- [x] Unique root WIP remains recoverable from the archive branch and tag.
- [x] Other manual worktrees and stale records are removed without deleting runtime state.

## Out Of Scope

- Shipping the archived Canvas and library WIP in this release.
- Synchronizing environment files, credentials, accounts, database rows, queues, media, or provider state.
- Paid provider calls or Feishu/Lark writes.
