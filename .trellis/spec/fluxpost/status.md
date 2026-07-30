# Trellis Status

Last updated: 2026-07-30

## One-Line Status

Normal-member image imports now work without secure-context UUID APIs on LAN HTTP; production 38 remains healthy at commit `542cbb5`.

## Current Focus

- Infinite Canvas zoom phases 1 through 3 are loaded by the local port-3001 production process: React Flow culls offscreen elements; idle edges render only a static path; active beams pause during movement; `full`/`reduced`/`overview` detail tiers progressively suspend expensive paint; and the main viewport now owns one stable `WillChangeTransform` compositor layer without media remounts or geometry changes. These local refinements are not deployed to production 38.
- Production 38 is healthy at release `20260723-113938-542cbb5e2d1f`; 104 is retired and its DNS cleanup remains separate.
- Image-library upload queues use page-local monotonic IDs and surface synchronous preparation failures, so normal members on LAN HTTP do not silently lose file selections when `crypto.randomUUID()` is unavailable.
- HEIC/TOS, Weibo App-detail, vehicle/reference library, Windows Feishu CLI, and Canvas workflows are locally verified but remain behind their documented operator gates.
- The owner-scoped copy library, frozen Canvas copy input, round-robin batch copy pools, and separate title/body GPT paths are locally verified and `ready_for_review`; live model calls remain an operator gate.
- Trellis uses `.trellis/spec/fluxpost` and `.trellis/verification`; disabled Harness paths remain migration archives only.
- Xiaohongshu keyword and detail flows use TikHub App V2 and reject provider business failures even on HTTP 200.
- Production deployment remains GitHub release-based with loopback-only app/PostgreSQL defaults; stable details and commands live in `project_brief.md`.
- The signed-in home is compact-only; `/content` owns content-pool and material-library operations, while `/review`, `/distribution-check`, and admin `/config` remain independent workspaces.
- Default startup context must stay under 45 KB, and typical code-task context under 70 KB. Keep this file lightweight and move history to archives when it grows.

## Next Entry

1. Treat the four intentionally unchanged historical images as a separate follow-up only if larger-than-12-MB source ingestion or malformed HEIF recovery becomes a product requirement.
2. For the next operator-approved Weibo sample, verify the App response shape and fallback diagnostics in the execution log; do not automatically retry the previous failed task or call paid TikHub as a baseline check.
3. Run an authenticated compact-workspace review on production 38 without calling paid providers by default.
4. After operator approval, retry the 17-post Feishu batch; verify TOS URL persistence, record-id reuse, attachment counts, and partial handling. Never auto-retry it.
5. Continue `.trellis/tasks/07-20-tos-runtime-media-storage` on production 38; 82 and 104 are retired FluxPost targets.
6. Verify real library TOS PUT/HEAD/public read/delete for both roles and GPT tagging/retry only for reference assets through operator-approved tests on 38 before marking `reference-image-library` done.
7. For config/admin work, inspect `src/lib/config.ts`, `src/app/api/config/route.ts`, `src/app/config/page.tsx`, and `.trellis/verification/advanced_config_check.mjs` first.
8. For Feishu publish or identity issues, inspect `src/lib/feishu-cli-identity.ts`, `src/lib/feishu-cli.ts`, `src/lib/feishu-publish-queue.ts`, `src/lib/feishu-field-options.ts`, and `src/app/api/publish/feishu/route.ts` first.
9. Before completion, read `.trellis/spec/fluxpost/verification.md` and run `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`, or explain why it could not run.
10. For canvas/copy work, inspect `src/lib/copy-library.ts`, `src/lib/canvas/`, their API routes, and the active Trellis task; never reread source copy during finalization or run paid providers as baseline checks.

## Recent Verification

- 2026-07-30: Canvas zoom phase 3 passed focused contracts, TypeScript, scoped lint, two production builds, local restart/HTTP smoke, and a fully mocked 80-node Chromium/CDP check. Forty wheel events produced the expected 40 native viewport transforms at 16.7 ms P95 with no long tasks; LayerTree attributed exactly one viewport-owned layer to `WillChangeTransform`; node/handle geometry, media DOM identity, 160 one-time media requests, Controls, MiniMap, nonblank pixels, and console health remained stable. The documented baseline wrapper still stops at its missing `.trellis/verification/check.mjs`.
- 2026-07-30: Canvas zoom phase 2 passed detail-tier boundary/idempotence and graph-persistence contracts, TypeScript, scoped lint with five pre-existing warnings, `git diff --check`, two production builds, local restart/HTTP smoke, and a fully mocked 80-node Chromium check. Fit View reached overview detail; selected-node detail remained available; zoom crossed reduced/full; same-tier movement wrote zero tier mutations; movement hid rich media/MiniMap and removed node shadow while preserving `220x221` geometry; no external calls occurred. The documented baseline wrapper still stops at its missing `.trellis/verification/check.mjs`.
- 2026-07-30: Canvas zoom phase 1 passed focused Canvas contracts, active-edge projection cases, TypeScript, scoped lint with five pre-existing warnings, `git diff --check`, two production builds, local restart/HTTP smoke, and mocked Chromium checks proving 4/7 viewport nodes rendered, idle/active business path counts of 1/3, movement-time beam suppression, end-of-movement restoration, and reduced-motion suppression without external calls. The documented baseline wrapper still stops at its missing `.trellis/verification/check.mjs`.
- 2026-07-29: Normal-member image imports no longer depend on secure-context `crypto.randomUUID`; operator ownership/collection permission contracts, focused/dynamic library checks, TypeScript, scoped lint, build/restart/HTTP smoke, and mocked Playwright with `randomUUID` forced to throw passed without external calls. The full baseline passed all library checks and stopped at an unrelated Node 24 `fetch bad port` in the historical TOS recovery check; full lint also retains the unrelated temporary CJS blocker.
- 2026-07-28: Copy library CRUD/permissions/tags, frozen Canvas input, stable batch assignment, two-GPT skeleton, build/restart, and mocked 1440x960/390x844 interactions passed without external calls. Playwright found and regression coverage fixed delayed draft synchronization erasing fast new-copy input; full baseline passed all domain checks and stopped only on the unrelated temporary CJS lint error.
- Earlier verification evidence is indexed in `.trellis/spec/fluxpost/verification.md` and preserved under `.trellis/spec/fluxpost/archive/`.

## Current Risks

- Real operator-scale Canvas frame timing is pending confirmation; the isolated browser check verifies DOM and computed-style load reduction but does not reproduce a production user's largest workflow or input device cadence.
- Four historical exact matches remain intentionally unchanged: three source images exceed the 12 MB cache limit and one source returns `HEIF image not found`; address them only through a separately scoped ingestion-policy decision.
- The Weibo App detail path is deployed and contract-tested but not yet validated against a paid live TikHub response; one approved sample should confirm the response shape and fallback observability before calling the migration fully live-validated.
- `bbs.vollov1.xyz` still resolves to retired host 104 even though HTTPS and the FluxPost service are gone; remove the external DNS record when convenient to avoid a stale hostname.
- Production 38 is Ubuntu 22.04; use the existing deploy wrapper, because fresh bootstrap installation requires Ubuntu 24.04.
- TOS secrets from the operator-provided `TOS.txt` must never appear in commands, logs, Git, Trellis, or responses. The target container must not inherit `NODE_TLS_REJECT_UNAUTHORIZED=0`; keep TOS disabled if the admin public-read/Range/delete probe fails.
- `@volcengine/tos-sdk@2.9.1` currently depends on Axios versions with published high-severity advisories and no upstream SDK fix. Keep endpoint configuration admin-only, HTTPS verification enabled, SDK proxy/retry behavior constrained, and revisit the dependency when a fixed release exists.

- Do not read or expose `.env.local`, `.env*`, database credentials, Feishu/Lark tokens, API keys, local account passwords, or real chat/user identifiers.
- Do not mutate `data/`, `public/generated/`, `public/media/`, debug artifacts, or runtime databases during Trellis-only work.
- Do not trigger live TikHub, OpenAI-compatible text/image providers, ComfyUI, Feishu writes, Lark replies, or simple-run production as default verification.
- Do not use `docs/harness.disabled/` or `scripts/harness.disabled/` as active context/check paths unless explicitly doing migration archaeology.
- VPS operator-managed base secrets live in `/opt/fluxpost-studio/shared/env.production`; admin-managed overrides live in the `fluxpost_fluxpost-config` Docker volume. Do not print either source, copy secrets into Trellis/final answers, or remove the config volume during routine cleanup.
- Production 38 is the only remote FluxPost fix/deployment target and uses Nginx/public HTTPS with app port 3101 loopback-only. Retired 82 remains stopped; 104 has no FluxPost runtime.
- `handoff.md` and `progress.md` are history libraries now; do not append routine conversation logs there.
- Long historical evidence is archived, not deleted. Use archive files only when the lightweight entry does not answer the task.

## Necessary History Paths

- Full previous handoff: `.trellis/spec/fluxpost/archive/handoff-history-2026-06-17.md`
- Full previous progress: `.trellis/spec/fluxpost/archive/progress-history-2026-06-17.md`
- Full previous verification log: `.trellis/spec/fluxpost/archive/verification-history.md`
- Full previous feature evidence: `.trellis/spec/fluxpost/archive/feature-list-history-2026-06-17.json`
- Previous pitfalls: `.trellis/spec/fluxpost/archive/pitfalls-history-2026-06-17.md`
- Previous architecture rules: `.trellis/spec/fluxpost/archive/architecture-rules-history-2026-06-17.md`

## Handoff Minimum Standard

After reading only `AGENTS.md`, this file, `.trellis/spec/fluxpost/feature_list.json`, and `.trellis/spec/fluxpost/rules.md`, a new session must be able to answer:

- Whether the current task is complete.
- If incomplete, what the next step is.
- Which files should be inspected first.
- Which verification should be run.
- What risks and boundaries must not be crossed.

Do not append long deployment, verification, or troubleshooting logs to this file. Put reusable history in the relevant archive file or in the `TRELLIS-LATEST` block only when cross-session continuation requires it.
