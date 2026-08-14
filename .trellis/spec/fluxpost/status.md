# Trellis Status

Last updated: 2026-08-14

## One-Line Status

Production remains at `a887c158410124d969f608f7a0146e4345cc050a`; local branch `release/production-candidate-20260814` integrates retention v4, Canvas video reconstruction, and library role-entry time filters and has not been pushed or deployed.

## Current Focus

- Production includes content safety, durable Feishu publishing, Canvas shared outputs and workflow portability, `/original`, bounded Canvas scheduling, and team image/copy libraries.
- The isolated candidate preserves production SHA `a887c158...` as its base and adds Docker retention v4, owner-scoped source-video reconstruction with frozen V2 inputs, and role-specific library entry timestamps/date filters.
- The candidate also fixes a Windows-only verification defect by accepting CRLF function boundaries without weakening review-desk behavior assertions.
- The original dirty root worktree and its unfinished visual-node/shared-library artifacts remain unchanged and outside the candidate.
- No candidate push, VPS verification, production preflight, provider smoke, or deployment has occurred.

## Next Entry

1. Re-run the complete baseline on the final evidence commit and report its full local SHA.
2. Push only after explicit authorization, then require remote SHA equality, isolated VPS candidate verification, and read-only production preflight.
3. Production deployment remains a separate explicit approval; keep all paid providers and external writes behind operator approval.

## Recent Verification

- 2026-08-14: Candidate code through `011c15e` passed Canvas workflow/video/scheduler, library, review, deployment, and all other deterministic checks plus lint, TypeScript, production build, isolated HTTP smoke, and SQLite without external calls.
- 2026-08-11: Canvas video reconstruction passed focused source/service/FFmpeg/workflow/scheduler/concurrency checks, lint, TypeScript, build, full baseline, restart/HTTP smoke, and mocked desktop/mobile Chromium locally.
- 2026-08-10: Library role-entry times and date filters passed focused checks, the full baseline, restart, and mocked desktop/mobile Chromium locally.
- 2026-08-05: Canvas portability and V2 shared outputs deployed at exact SHA `a887c158410124d969f608f7a0146e4345cc050a` after local, isolated, identity, health, auth, worker, volume, log, and rollback checks.
- Older evidence is indexed in `verification.md` and preserved under `.trellis/spec/fluxpost/archive/`.

## Current Risks

- Paid-provider behavior, operator-scale Canvas timing, multi-user PostgreSQL concurrency, and local-history import remain pending confirmation.
- Four historical media matches remain unchanged: three sources exceed the 12 MB cache limit and one reports `HEIF image not found`.
- `bbs.vollov1.xyz` still resolves to retired host 104; DNS cleanup is separate.
- Production 38 uses Ubuntu 22.04; use its installed release wrapper because fresh bootstrap requires Ubuntu 24.04.
- TOS/provider credentials, database values, environment files, local accounts, runtime rows, generated media, and debug artifacts must never enter Git or Trellis context.
- `@volcengine/tos-sdk@2.9.1` retains published Axios advisories without an upstream SDK fix.
- Never remove `fluxpost-config`, PostgreSQL, data, media, generated, or node-home volumes during deploy or rollback.
- The candidate is local-only until a remote full-SHA equality check and isolated VPS verifier succeed.

## Necessary History Paths

- `.trellis/spec/fluxpost/archive/handoff-history-2026-06-17.md`
- `.trellis/spec/fluxpost/archive/progress-history-2026-06-17.md`
- `.trellis/spec/fluxpost/archive/verification-history.md`

## Handoff Minimum Standard

Startup context must identify the production release, local-only work, next verification/deployment gate, and prohibited actions. Read archive history only when the lightweight files do not answer the task.
