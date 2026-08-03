# Trellis Status

Last updated: 2026-08-03

## One-Line Status

The local `utility.text-concatenate@1` Canvas candidate is fully verified and awaiting commit/push/deployment; production 38 still serves exact SHA `a65767384c1b1993c95c8c32d053edcd10c3fac6` as release `20260803-075434-a65767384c1b`.

## Current Focus

- Production 38 runs exact SHA `a65767384c1b1993c95c8c32d053edcd10c3fac6`; hosts 82 and 104 remain retired. The release includes deployment wrapper v3, verifier v1, the shared lock, Docker verifier, and repaired dependency/check fixtures.
- `/original` is deployed with durable owner-scoped 1-100 topic batches, cover-first card generation, QA/retry, review drafts, and resumable ToAPIs tasks. Its real provider smoke remains pending approval.
- Canvas exact/range sampling, no-replacement parameter/copy pools, frozen-image preflight, cross-cursor selection, copy-pool bulk selection, guarded previews, distance-bounded three-layer edge pulses, native zoom, culling/detail tiers, stable media, and bounded queue concurrency are deployed.
- Team image/copy libraries with server sorting, stable cursors, batch/range selection, and anchored preview are deployed. The local-path material domain remains retired; compact runs freeze validated vehicle-library URLs.

## Next Entry

1. Commit/push the verified text-concatenate candidate, then deploy its exact SHA after the existing zero-work, backup, verifier, and wrapper gates pass.
2. Run the established read-only post-deploy identity, route, auth, schema, worker, service, volume, and rollback checks.
3. Run an operator-approved real `/original` smoke with 2 topics and 3 cards each; verify ratio, consistency, QA, regeneration, review, and billing.
4. Keep Seedance, GPT image/text, TikHub, ComfyUI, Feishu writes, and Lark actions behind explicit operator approval.

## Recent Verification

- 2026-08-03: Local `utility.text-concatenate@1` passed focused checks, TypeScript, lint, build/restart, HTTP, baseline, diff/task validation, and mocked desktop/mobile checks without external calls.
- 2026-08-03: Exact SHA `a65767384c1b1993c95c8c32d053edcd10c3fac6` deployed to production 38 as `20260803-075434-a65767384c1b` after local baseline, commit-bound isolated VPS verification, zero-active-work preflight, and a root-only PostgreSQL backup. Manifest/image/container identity, app/PostgreSQL, Nginx/public HTTPS, Open WebUI, six named volumes, required schema, auth boundaries, routes, workers, and retained rollback release passed without provider or external-write calls.
- 2026-07-31: Canvas edge pulses now use distance-bounded trail/body/core layers with idle/active timing, duration-aware phase offsets, moving/reduced-motion suspension, and source-to-target interpolation. Focused checks, TypeScript, lint, production build/restart, full baseline, HTTP smoke, and mocked dark/light/mobile browser checks passed without external calls.
- 2026-07-31: Canvas copy-pool manual selection now supports selecting and clearing all entries in the current filter. The mistakenly restored retired `src/app/api/library/migrate/route.ts` surface was removed; focused checks, the full baseline, production build/restart, and port 3001 HTTP smoke passed.
- 2026-07-30: `/original` passed deterministic domain, schema, API, resume/recovery, review, TypeScript, lint, build/restart, HTTP, and mocked responsive checks without provider calls.
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
