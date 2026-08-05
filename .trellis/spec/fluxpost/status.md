# Trellis Status

Last updated: 2026-08-05

## One-Line Status

Configurable content safety is deployed to production 38 at SHA `e6692c3d0cce807106e343c43a9804be2686ec3d`.

## Current Focus

- Configurable content safety is deployed: admin categories/rules, optional model review, thresholds, master-off, revisions, snapshots, and draft tests are available in `/config`.
- Production Feishu publishing creates one durable Job before worker preparation, then persists ordered 10-post chunks, isolated failures, and review progress. The release was verified without a live Feishu write.
- Cursor-anchored Canvas preview zoom is deployed. V2 main-task shared outputs plus cross-board clipboard and workflow file portability have passed local gates and are not yet deployed.
- `/original` is deployed with durable owner-scoped 1-100 topic batches, cover-first card generation, QA/retry, review drafts, and resumable ToAPIs tasks. Its real provider smoke remains pending approval.
- Canvas exact/range sampling, no-replacement parameter/copy pools, frozen-image preflight, cross-cursor selection, copy-pool bulk selection, guarded previews, distance-bounded three-layer edge pulses, native zoom, culling/detail tiers, stable media, and bounded queue concurrency are deployed.
- Team image/copy libraries with server sorting, stable cursors, batch/range selection, and anchored preview are deployed. The local-path material domain remains retired; compact runs freeze validated vehicle-library URLs.

## Next Entry

1. Run an operator-approved real `/original` smoke with 2 topics and 3 cards each; verify ratio, consistency, QA, regeneration, review, and billing.
2. Use a small authenticated non-paid Canvas workflow before any operator-approved provider batch.
3. Keep Seedance, GPT image/text, TikHub, ComfyUI, Feishu writes, and Lark actions behind explicit operator approval.

## Recent Verification

- 2026-08-04: Safety policy SHA `e6692c3d0cce807106e343c43a9804be2686ec3d` passed isolated baseline and deployed as `20260804-102825-e6692c3d0cce`; identity, health, auth, zero queues, volumes, backup, and rollback passed offline.
- 2026-08-04: Exact SHA `39f99e2415fa93c08e8727bea30841e88d28a2a6` passed local and isolated production baselines, then deployed as `20260804-081822-39f99e2415fa` after zero-active-work preflight and a validated root-only backup. Identity, health, routes/auth, workers, JSONB queue storage, six volumes, logs, and rollback retention passed without a live Feishu write.
- 2026-08-05: Canvas portability and V2 shared outputs passed workflow/scheduler checks, mocked Chromium, TypeScript, lint, build/restart, local `200/401`, and the complete isolated baseline without external calls.
- Older evidence is indexed in `verification.md` and preserved under `.trellis/spec/fluxpost/archive/`.

## Current Risks

- Paid-provider behavior, operator-scale Canvas timing, multi-user PostgreSQL concurrency, and local-history import remain pending confirmation.
- Four historical media matches remain unchanged: three sources exceed the 12 MB cache limit and one reports `HEIF image not found`.
- `bbs.vollov1.xyz` still resolves to retired host 104; DNS cleanup is separate.
- Production 38 uses Ubuntu 22.04; use its installed release wrapper because fresh bootstrap requires Ubuntu 24.04.
- TOS/provider credentials, database values, environment files, local accounts, runtime rows, generated media, and debug artifacts must never enter Git or Trellis context.
- `@volcengine/tos-sdk@2.9.1` retains published Axios advisories without an upstream SDK fix.
- Never remove `fluxpost-config`, PostgreSQL, data, media, generated, or node-home volumes during deploy or rollback.

## Necessary History Paths

- `.trellis/spec/fluxpost/archive/handoff-history-2026-06-17.md`
- `.trellis/spec/fluxpost/archive/progress-history-2026-06-17.md`
- `.trellis/spec/fluxpost/archive/verification-history.md`

## Handoff Minimum Standard

Startup context must identify the production release, local-only work, next verification/deployment gate, and prohibited actions. Read archive history only when the lightweight files do not answer the task.
