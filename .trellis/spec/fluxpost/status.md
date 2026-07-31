# Trellis Status

Last updated: 2026-07-31

## One-Line Status

Infinite Canvas is live at `https://flux.lightmoment.net/canvas` on production release `20260729-061224-d05caddb1787`; newer Canvas, library, and original-batch work remains local on port 3001.

## Current Focus

- Production 38 runs exact SHA `d05caddb17875bb9a5dde924f9e4e8654f8d3ee3`; image identity, protected services, schema, workers, volumes, auth, and rollback were verified. Hosts 82 and 104 are retired.
- Local `/original` provides durable owner-scoped 1-100 topic batches, cover-first card generation, QA/retry, review drafts, and resumable ToAPIs tasks. It is not deployed.
- Local Canvas adds exact/range sampling, no-replacement parameter/copy pools, frozen-image preflight, cross-cursor selection, copy-pool bulk selection, guarded previews, distance-bounded three-layer edge pulses, native zoom, culling/detail tiers, stable media, and bounded queue concurrency. These refinements are not deployed.
- Team image/copy libraries use server sorting, stable cursors, batch/range selection, and anchored preview. The local-path material domain was retired; compact runs freeze validated vehicle-library URLs.
- The cross-platform baseline is restored and passed for the combined local worktree on 2026-07-31.

## Next Entry

1. Commit the combined local release candidate without `.tmp-*`, runtime data, generated media, credentials, or environment files.
2. Run an operator-approved real `/original` smoke with 2 topics and 3 cards each; verify ratio, consistency, QA, regeneration, review, and billing.
3. Review/archive the Canvas image-source and scheduler tasks after their commits are isolated; keep them local until a dedicated exact-SHA release.
4. Use a small authenticated non-paid Canvas workflow before any operator-approved provider batch.
5. Keep Seedance, GPT image/text, TikHub, ComfyUI, Feishu writes, and Lark actions behind explicit operator approval.
6. For future deployment, start from current GitHub `main`, reapply bounded local features, verify a clean candidate, push its full SHA, and deploy only through the confirmed release wrapper.

## Recent Verification

- 2026-07-31: Canvas edge pulses now use distance-bounded trail/body/core layers with idle/active timing, duration-aware phase offsets, moving/reduced-motion suspension, and source-to-target interpolation. Focused checks, TypeScript, lint, production build/restart, full baseline, HTTP smoke, and mocked dark/light/mobile browser checks passed without external calls.
- 2026-07-31: Canvas copy-pool manual selection now supports selecting and clearing all entries in the current filter. The mistakenly restored retired `src/app/api/library/migrate/route.ts` surface was removed; focused checks, the full baseline, production build/restart, and port 3001 HTTP smoke passed.
- 2026-07-30: `/original` passed deterministic domain, schema, API, resume/recovery, review, TypeScript, lint, build/restart, HTTP, and mocked responsive checks without provider calls.
- 2026-07-30: Canvas image preflight, selection, scheduler sampling, native zoom, and visual fixes passed focused contracts, TypeScript, lint, build/restart, HTTP, and mocked responsive checks.
- 2026-07-29: Production SHA `d05caddb17875bb9a5dde924f9e4e8654f8d3ee3` passed candidate and deployment identity, schema, auth, service, volume, worker, and rollback checks.
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
