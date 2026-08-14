# 保持本地生产镜像与远程生产一致

## Goal

Keep the local production mirror and remote production on the same verified application commit while preserving an independent local development environment.

## Background

- Production runs `39a35f8dd869d50df9008ba708e14b92eeefc761`; GitHub `main` contains it.
- The historical root worktree is dirty and cannot safely represent either `main` or production.
- Port `3001` currently starts from that root and lacks a route present in production, so health alone does not prove parity.
- The user approved port `3001` as the local production mirror and port `3000` as development.

## Requirements

### R1. Environment roles

- Port `3001` runs only a clean dedicated worktree at the exact remote production commit.
- Port `3000` remains development and disables background workers by default when sharing local state.
- Code and schema contracts are synchronized; secrets, accounts, database rows, queues, media, and provider state are not.

### R2. Release identity

- Production and local-mirror processes receive a validated full lowercase Git SHA and bounded runtime mode.
- A public no-store endpoint returns only the commit, mode, and whether the runtime is versioned.
- Development may be unversioned, but an unversioned process can never satisfy mirror parity.

### R3. Production activation

- Deploy and rollback inject the commit from the target `release.manifest` into the app container.
- Rollback reports the rollback release commit, not a newer failed deployment commit.
- Existing exact-SHA, image, health, volume, retention, and approval gates remain intact.

### R4. Local mirror

- A sibling Git worktree holds the mirror; the dirty root never supplies port `3001`.
- Synchronization supports explicit-SHA resolution for identity-enabled releases and normal production-endpoint resolution; it clearly rejects pre-identity commits.
- It verifies full SHA, `origin/main` ancestry, mirror cleanliness, and builds before stopping the old listener.
- It injects local-production mode/SHA, verifies startup identity, preserves pre-activation availability, and reports a bounded rollback path.
- Local configuration is selected by path without copying, printing, committing, or uploading its contents.

### R5. Drift check

- One read-only command compares local/remote runtime identities, mirror HEAD/cleanliness, and production ancestry in `origin/main`.
- Local and remote commits must match; `main` may be ahead but must contain production.
- Failures distinguish invalid/missing identity, wrong mode, dirty/missing mirror, HEAD mismatch, unreachable endpoints, SHA divergence, and non-main production.
- Default verification uses fixtures only and never calls production or GitHub.

### R6. Historical root convergence

- Preserve the existing dirty files until local-only items are reviewed.
- Do not recommit exact-main duplicates, superseded production versions, or archived task duplicates.
- Review the vision-node plan, library-time evidence, selection screenshots, and four root-only tracked files separately.
- No destructive reset/checkout or secret/runtime/user-data inclusion is allowed.

### R7. Operating policy

- New work starts from current `origin/main`; historical release branches and stale local `main` are not development bases.
- Production still deploys only an approved full SHA.
- Every activation or rollback is followed by local mirror synchronization and a passing parity check.
- Trellis and project startup/deployment guidance record the dual-local model without adding another context system.

## Acceptance Criteria

- [ ] Remote production and local `3001` report the same valid full SHA with no sensitive fields.
- [ ] The reported production SHA is an ancestor of current `origin/main`.
- [ ] The mirror worktree is clean, its HEAD matches its runtime SHA, and port `3001` runs from it.
- [ ] Port `3000` remains available for development with shared-state workers disabled by default.
- [ ] Drift verification succeeds on parity and returns specific failures for every tested mismatch.
- [ ] Deployment tests prove manifest-derived identity for deploy and rollback.
- [ ] Mirror tests prove validation, ancestry, cleanliness refusal, build-before-stop ordering, injection, and startup equality.
- [ ] Historical dirty files remain preserved and classified; no bulk commit or destructive reset occurs.
- [ ] Focused checks, lint, TypeScript, build, and the complete deterministic baseline pass.
- [ ] Production rollout remains behind a separate operator approval and verifies identity plus existing safety gates.

## Out Of Scope

- Synchronizing `.env*`, credentials, accounts, runtime rows, queues, or media.
- Automatically deploying each `main` commit or treating undeployed `main` as production.
- Implementing the unfinished Canvas vision-node behavior or invoking paid/external workflows.
