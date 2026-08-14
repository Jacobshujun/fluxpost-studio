# Trellis Status

Last updated: 2026-08-14

## One-Line Status

Production runs `669a3272f764a05f994b87875ff6a9fc8df78675` as `20260814-055428-669a3272f764`; batch-schedule copies now use one Beijing-time suffix instead of stacking `副本`.

## Current Focus

- Production includes Docker retention v4, Canvas source-video reconstruction, library role-entry time filters, and normalized batch-copy naming.
- Exact SHA `669a3272f764a05f994b87875ff6a9fc8df78675` passed local/VPS baselines, remote equality, zero-work preflight, backup, deployment, and post-deploy gates.
- Release `20260814-055428-669a3272f764` has healthy app/PostgreSQL, enabled workers, expected route/auth boundaries, seven volumes, zero active work, two rescue images, and an active BuildKit timer.
- The original dirty root worktree and its unfinished visual-node/shared-library artifacts remain unchanged and outside the candidate.
- No provider or external write was used as release verification.
- Batch-schedule copies normalize trailing markers to `副本 YYYYMMDD-HHmmss` from `createdAt` in `Asia/Shanghai`; only the base is truncated at the 80-character limit.

## Next Entry

1. Treat `20260814-055428-669a3272f764` as the production baseline and `20260814-025955-5be0cb988580` as its retained rollback release.
2. Keep provider smokes, authenticated production workflows, and external writes behind separate operator approval.

## Recent Verification

- 2026-08-14: Exact SHA `669a3272f764a05f994b87875ff6a9fc8df78675` passed copy-name regressions, complete local/VPS baselines, zero-work preflight, validated 5,472,393-byte backup, and production activation as `20260814-055428-669a3272f764`; identity, health, routes/auth, workers, 15 required tables, seven volumes, protected services, retention/timer, logs, and rollback readiness passed without external writes.
- 2026-08-14: Prior release `5be0cb988580149037655d4213be6faa835c820d` passed its complete release gates and remains retained as rollback `20260814-025955-5be0cb988580`.
- 2026-08-14: Candidate code through `011c15e` passed Canvas workflow/video/scheduler, library, review, deployment, and all other deterministic checks plus lint, TypeScript, production build, isolated HTTP smoke, and SQLite without external calls.
- 2026-08-11: Canvas video reconstruction passed focused source/service/FFmpeg/workflow/scheduler/concurrency checks, lint, TypeScript, build, full baseline, restart/HTTP smoke, and mocked desktop/mobile Chromium locally.
- 2026-08-10: Library role-entry times and date filters passed focused checks, the full baseline, restart, and mocked desktop/mobile Chromium locally.
- Older evidence is indexed in `verification.md` and preserved under `.trellis/spec/fluxpost/archive/`.

## Current Risks

- Paid-provider behavior, operator-scale Canvas timing, multi-user PostgreSQL concurrency, and local-history import remain pending confirmation.
- Four historical media matches remain unchanged: three sources exceed the 12 MB cache limit and one reports `HEIF image not found`.
- `bbs.vollov1.xyz` still resolves to retired host 104; DNS cleanup is separate.
- Production 38 uses Ubuntu 22.04; use its installed release wrapper because fresh bootstrap requires Ubuntu 24.04.
- TOS/provider credentials, database values, environment files, local accounts, runtime rows, generated media, and debug artifacts must never enter Git or Trellis context.
- `@volcengine/tos-sdk@2.9.1` retains published Axios advisories without an upstream SDK fix.
- Never remove `fluxpost-config`, PostgreSQL, data, media, generated, or node-home volumes during deploy or rollback.
- GitHub `main` must contain the deployed SHA through normal fast-forward history; future deploys still require a newly verified exact SHA.

## Necessary History Paths

- `.trellis/spec/fluxpost/archive/handoff-history-2026-06-17.md`
- `.trellis/spec/fluxpost/archive/progress-history-2026-06-17.md`
- `.trellis/spec/fluxpost/archive/verification-history.md`

## Handoff Minimum Standard

Startup context must identify the production release, local-only work, next verification/deployment gate, and prohibited actions. Read archive history only when the lightweight files do not answer the task.
