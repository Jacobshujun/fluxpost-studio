# Trellis Status

Last updated: 2026-08-14

## One-Line Status

Production runs `39a35f8dd869d50df9008ba708e14b92eeefc761` as `20260814-085108-39a35f8dd869`; the local-production parity candidate is committed locally but is not pushed or deployed.

## Current Focus

- Production is healthy on release `20260814-085108-39a35f8dd869`; GitHub `main` contains its exact SHA.
- The parity candidate adds public runtime identity, manifest-derived deploy/rollback identity, port-3000 development with workers default-off, SHA-specific port-3001 mirror releases, and a read-only drift check.
- The historical dirty root and its unfinished visual-node/shared-library artifacts remain unchanged and outside the candidate.

## Next Entry

1. Request approval to push the exact candidate commit and verify the remote SHA.
2. Request separate approval for VPS candidate verification/preflight and production deployment.
3. After deployment, synchronize port `3001` from production `/api/version` and require `npm run local:parity`.

## Recent Verification

- 2026-08-14: Parity contracts, PowerShell parsing, TypeScript, lint, build, isolated identity HTTP smoke, SQLite, and the complete deterministic baseline passed; the candidate was committed locally without push or deployment.
- 2026-08-14: Production SHA `39a35f8dd869d50df9008ba708e14b92eeefc761` passed its approved local/VPS/deploy/post-deploy gates and activated as `20260814-085108-39a35f8dd869` without external provider writes.
- Older evidence is indexed in `verification.md` and preserved under `.trellis/spec/fluxpost/archive/`.

## Current Risks

- Current production predates `/api/version`; end-to-end mirror equality cannot be proven until an identity-enabled candidate is approved and deployed.
- Paid-provider behavior, operator-scale Canvas timing, multi-user PostgreSQL concurrency, and local-history import remain pending confirmation.
- Four historical media matches remain unchanged: three exceed the 12 MB cache limit and one reports `HEIF image not found`.
- Production uses Ubuntu 22.04; routine changes must use its installed exact-SHA release wrapper. Retired host 104 is not a promotion target.
- Secrets, environment files, accounts, runtime rows, queues, media, volumes, and debug artifacts must never enter Git or Trellis context or be synchronized by the mirror.
- `@volcengine/tos-sdk@2.9.1` retains published Axios advisories without an upstream SDK fix.

## Necessary History Paths

- `.trellis/spec/fluxpost/archive/handoff-history-2026-06-17.md`
- `.trellis/spec/fluxpost/archive/progress-history-2026-06-17.md`
- `.trellis/spec/fluxpost/archive/verification-history.md`

## Handoff Minimum Standard

Startup context must identify the production release, local-only work, next verification/deployment gate, and prohibited actions. Read archive history only when lightweight files do not answer the task.
