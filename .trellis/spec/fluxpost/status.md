# Trellis Status

Last updated: 2026-08-14

## One-Line Status

Production runs `5be0cb988580149037655d4213be6faa835c820d` as `20260814-025955-5be0cb988580`; the locally verified batch-copy naming fix awaits fixed-SHA production gates.

## Current Focus

- Production adds Docker retention v4, owner-scoped Canvas source-video reconstruction, and role-specific library entry time filters to the prior durable workflows.
- Exact SHA `5be0cb988580149037655d4213be6faa835c820d` passed local/isolated baselines, remote equality, zero-work preflight, backup, deployment, and post-deploy gates.
- Release `20260814-025955-5be0cb988580` has healthy app/PostgreSQL, enabled workers, HTTP 200 on the key workspaces, expected 401/405 auth and method boundaries, unchanged seven-volume inventory, zero active work, two rescue images, and an active BuildKit cleanup timer.
- The original dirty root worktree and its unfinished visual-node/shared-library artifacts remain unchanged and outside the candidate.
- No provider or external write was used as release verification.
- Batch-schedule copies normalize trailing markers to `副本 YYYYMMDD-HHmmss` from `createdAt` in `Asia/Shanghai`; only the base is truncated at the 80-character limit.

## Next Entry

1. Push the clean candidate, verify its remote full SHA, then run isolated VPS verification and production preflight.
2. Obtain exact-SHA approval before deploying through the installed release wrapper; keep provider smokes, authenticated production workflows, and external writes out of this release.

## Recent Verification

- 2026-08-14: Batch-schedule copy naming passed base/legacy/stacked/time-stamped/80-character regression coverage, the focused scheduler check, TypeScript, lint, production build, complete isolated baseline, HTTP smoke, and SQLite without external calls.
- 2026-08-14: Exact SHA `5be0cb988580149037655d4213be6faa835c820d` passed the complete local and isolated VPS baselines, zero-work preflight, validated 5,438,693-byte root-only PostgreSQL backup, and production activation as `20260814-025955-5be0cb988580`; identity, health, routes/auth, workers, 13 required tables, seven volumes, protected services, retention, timer, logs, and rollback readiness passed.
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
- GitHub `main` contains the deployed SHA through normal fast-forward history; future deploys still require a newly verified exact SHA.

## Necessary History Paths

- `.trellis/spec/fluxpost/archive/handoff-history-2026-06-17.md`
- `.trellis/spec/fluxpost/archive/progress-history-2026-06-17.md`
- `.trellis/spec/fluxpost/archive/verification-history.md`

## Handoff Minimum Standard

Startup context must identify the production release, local-only work, next verification/deployment gate, and prohibited actions. Read archive history only when the lightweight files do not answer the task.
