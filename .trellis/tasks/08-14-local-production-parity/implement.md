# Implementation Plan

## 1. Preserve unique work

- [x] Classify dirty-root files against `origin/main`.
- [x] Commit unique WIP and evidence to `archive/root-wip-20260817`.
- [x] Create and verify annotated tag `archive-root-wip-20260817`.

## 2. Single candidate model

- [x] Move all local preview and candidate commands to port `3001`.
- [x] Replace `local-production` runtime mode with `candidate`.
- [x] Make `local:restart` validate and run the current clean HEAD directly.
- [x] Remove mirror worktree synchronization and state-file logic.
- [x] Make parity require exact local, GitHub `main`, and production SHA equality.

## 3. Verification

- [x] Run PowerShell parsing and focused runtime/deployment checks.
- [x] Commit the candidate, then run `npm run local:restart` on port `3001`.
- [x] Run the complete deterministic baseline, lint, TypeScript, and build.
- [x] Verify local `/api/version`, health, and auth boundaries.

## 4. Promotion and deployment

- [ ] Push the tested candidate branch and fast-forward GitHub `main` to the exact SHA.
- [ ] Run the VPS isolated candidate verifier and read-only preflight.
- [ ] Deploy the exact SHA through the installed wrapper.
- [ ] Verify production identity, health, auth, workers, schema, volumes, services, logs, and rollback readiness.

## 5. Consolidation

- [ ] Retain one local repository/environment on port `3001`.
- [ ] Remove other clean worktrees and prune stale records.
- [ ] Remove merged or superseded local branches while preserving archive refs.
- [ ] Run final parity and update Trellis current state.

No paid providers, Feishu/Lark writes, runtime-data migration, volume removal, or secret/config synchronization is included.
