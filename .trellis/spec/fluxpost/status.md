# Trellis Status

Last updated: 2026-08-14

## One-Line Status

Production runs `39a35f8dd869d50df9008ba708e14b92eeefc761` as `20260814-085108-39a35f8dd869`; Canvas save-images is live and GitHub `main` contains the deployed SHA.

## Current Focus

- Exact SHA `39a35f8dd869d50df9008ba708e14b92eeefc761` passed local/VPS baselines, remote equality, zero-work preflight, backup, deployment, and post-deploy gates.
- Release `20260814-085108-39a35f8dd869` has healthy app/PostgreSQL, enabled workers, HTTP 200 on Canvas, unauthenticated image-download 401, 15 required tables, zero active work, seven volumes, two rescue images, and an active BuildKit timer.
- The original dirty root worktree and its unfinished visual-node/shared-library artifacts remain unchanged and outside the candidate.
- Production now includes the passive save-images node, owner-scoped sniffed downloads, and serial desktop handling without schema or external provider writes.

## Next Entry

1. Treat `20260814-085108-39a35f8dd869` as the production baseline and `20260814-055428-669a3272f764` as its retained rollback release.
2. Keep provider smokes, authenticated production workflows, and external writes behind separate operator approval.

## Recent Verification

- 2026-08-14: Exact SHA `39a35f8dd869d50df9008ba708e14b92eeefc761` passed save-images contracts, full local/VPS baselines, mocked Edge download flows, zero-work preflight, validated 5,522,879-byte backup, and production activation as `20260814-085108-39a35f8dd869`; identity, HTTP/auth, workers, schema, volumes, protected services, retention/timer, logs, and rollback readiness passed without external provider writes.
- 2026-08-14: Exact SHA `669a3272f764a05f994b87875ff6a9fc8df78675` passed copy-name regressions, complete local/VPS baselines, zero-work preflight, validated 5,472,393-byte backup, and production activation as `20260814-055428-669a3272f764`; identity, health, routes/auth, workers, 15 required tables, seven volumes, protected services, retention/timer, logs, and rollback readiness passed without external writes.
- Older evidence is indexed in `verification.md` and preserved under `.trellis/spec/fluxpost/archive/`.

## Current Risks

- Paid-provider behavior, operator-scale Canvas timing, multi-user PostgreSQL concurrency, and local-history import remain pending confirmation.
- Four historical media matches remain unchanged: three sources exceed the 12 MB cache limit and one reports `HEIF image not found`.
- `bbs.vollov1.xyz` still resolves to retired host 104; DNS cleanup is separate.
- Production 38 uses Ubuntu 22.04; use its installed release wrapper because fresh bootstrap requires Ubuntu 24.04.
- TOS/provider credentials, database values, environment files, local accounts, runtime rows, generated media, and debug artifacts must never enter Git or Trellis context.
- `@volcengine/tos-sdk@2.9.1` retains published Axios advisories without an upstream SDK fix.
- Never remove `fluxpost-config`, PostgreSQL, data, media, generated, or node-home volumes during deploy or rollback.
- GitHub `main` contains the deployed SHA through normal fast-forward history; future deploys still require a newly verified exact SHA.

## Necessary History Paths

- `.trellis/spec/fluxpost/archive/handoff-history-2026-06-17.md`
- `.trellis/spec/fluxpost/archive/progress-history-2026-06-17.md`
- `.trellis/spec/fluxpost/archive/verification-history.md`

## Handoff Minimum Standard

Startup context must identify the production release, local-only work, next verification/deployment gate, and prohibited actions. Read archive history only when the lightweight files do not answer the task.
