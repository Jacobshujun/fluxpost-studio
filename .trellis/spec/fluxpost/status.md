# Trellis Status

Last updated: 2026-08-04

## One-Line Status

Local Feishu publishing is durable and 10-post batched; Canvas work is verified; production 38 remains at SHA `06a2d7b81dc491c2c4ce1a17f6d3584e3c5d4605`.

## Current Focus

- Local Feishu publishing creates one durable Job before worker preparation, then persists ordered 10-post chunks, isolated failures, and review progress. Verified offline; not deployed.
- Local `/canvas` adds cursor-anchored preview zoom plus explicit V2 shared outputs: each main task freezes eligible `text/images/videos` upstream results once, then atomically fans out literalized child runs with guarded retry and legacy compatibility. These local changes are not deployed; production 38 remains on `06a2d7b81dc491c2c4ce1a17f6d3584e3c5d4605`.
- `/original` is deployed with durable owner-scoped 1-100 topic batches, cover-first card generation, QA/retry, review drafts, and resumable ToAPIs tasks. Its real provider smoke remains pending approval.
- Canvas exact/range sampling, no-replacement parameter/copy pools, frozen-image preflight, cross-cursor selection, copy-pool bulk selection, guarded previews, distance-bounded three-layer edge pulses, native zoom, culling/detail tiers, stable media, and bounded queue concurrency are deployed.
- Team image/copy libraries with server sorting, stable cursors, batch/range selection, and anchored preview are deployed. The local-path material domain remains retired; compact runs freeze validated vehicle-library URLs.

## Next Entry

1. Run an operator-approved real `/original` smoke with 2 topics and 3 cards each; verify ratio, consistency, QA, regeneration, review, and billing.
2. Use a small authenticated non-paid Canvas workflow before any operator-approved provider batch.
3. Keep Seedance, GPT image/text, TikHub, ComfyUI, Feishu writes, and Lark actions behind explicit operator approval.

## Recent Verification

- 2026-08-04: Feishu bulk queue/chunk/progress checks, full baseline, restart/HTTP, and desktop/mobile Chromium passed without live writes.
- 2026-08-04: Cursor-anchored Canvas image-preview zoom passed focused mocked Chromium, TypeScript, lint, production build/restart, isolated HTTP smoke, SQLite validation, and the complete Trellis baseline without external calls.
- 2026-08-04: Exact SHA `06a2d7b81dc491c2c4ce1a17f6d3584e3c5d4605` deployed as `20260804-025759-06a2d7b81dc4` after captured-drag Chromium coverage, local/VPS baselines, zero-active-work preflight, and a validated root-only backup. Manifest/image/container identity, routes/auth, services, six volumes, logs, and rollback retention passed.
- 2026-08-04: Exact SHA `fedceccfda93401cc1539df034dbd1833647b4a3` deployed as `20260804-023054-fedceccfda93` after mocked Chromium, local/VPS baselines, zero-work preflight, and backup. Identity, services, routes/auth, workers, ten required tables, six volumes, logs, and rollback retention passed.
- 2026-08-04: Canvas V2 main-task shared outputs passed multi-target validation/literalization/fan-out/retry coverage, independent review, mocked desktop/mobile Chromium, TypeScript, lint, production build/restart, HTTP smoke, SQLite/PostgreSQL contracts, and the complete baseline without provider calls.
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
