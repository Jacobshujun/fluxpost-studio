# Verification

Last updated: 2026-09-16

## Baseline Command

Run the cross-platform deterministic baseline before claiming code completion:

```powershell
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

`check.ps1` wraps `check.mjs`. Smoke disables workers on a private test port; port 3001 keeps workers enabled.

The large PostgreSQL acceptance benchmark is intentionally separate from the default baseline because it creates one million temporary relation rows. It only accepts loopback PostgreSQL by default, creates a unique schema, and drops that schema in `finally`:

```powershell
node --env-file=.env.local .trellis/verification/unified_library_postgres_benchmark.mjs
```

## Current Automated Checks

- Canvas: `canvas_workflows_check.mjs`; browser checks `canvas_text_viewport_browser_check.py` and `canvas_node_status_browser_check.py` cover focus/sizing in three themes at 1440/390. Use intercepted APIs and worker-disabled loopback `BROWSER_BASE_URL`, never 3001.

- Library colors: baseline real Sharp/SQLite/import/job checks, opt-in TEMP PostgreSQL and intercepted three-theme browser commands: `library_colors.md`.

- Text reasoning effort: baseline `advanced_config_check.mjs` covers all values/clear/invalid/sync, and `text_reasoning_effort_check.mjs` executes both endpoint shapes across every text-request module with isolated `fetch` mocks. Separate `python .trellis/verification/text_reasoning_effort_browser_check.py` checks Chinese options, save/reload, default restore and 1440/390 layout in three themes; use worker-disabled loopback `BROWSER_BASE_URL`, never 3001. Evidence: `.trellis/tasks/10-21-text-reasoning-effort/verification.md`.

- Gemini: baseline `canvas_gemini_check.mjs` covers loopback HTTP/proxy, config snapshots, media limits, failures/cancellation and Canvas executor/graph/iteration/V2/bypass contracts. Separate `python .trellis/verification/canvas_gemini_browser_check.py` checks node/config UI at 1440/390 in three themes using intercepted APIs; requires worker-disabled loopback `BROWSER_BASE_URL`, rejects 3001. See `gemini.md`; no live Gemini calls.

- Wonder Image: baseline `wonder_image_{contract,runtime,persistence,upload}_check.mjs` covers Yike JSON/forms/errors, duplicate media reuse, third-party readiness, JobId resume, result staging, encrypted credentials, numbered/legacy references and isolated SQLite/upload checks. `python .trellis/verification/wonder_image_browser_check.py` covers upload/paste/desktop drop, ordering/limits, credentials and edges in three themes at 1440/390 using intercepted APIs; use worker-disabled loopback `BROWSER_BASE_URL`, never 3001. Contract: `architecture_rules.md`; no live Yike calls.

- Canvas H.264: baseline `canvas_video_encoding_check.mjs` checks CPU output and explicit policy validation; opt-in real GPU/node commands and hardware limits are in `canvas_video_encoding.md`. GPU is never required by the default baseline.

- Canvas cancellation: baseline `canvas_cancellation_store_check.mjs`, `canvas_cancellation_runtime_check.mjs` and `canvas_cancellation_recovery_check.mjs` cover atomic run/node/queue cancellation, stale-write fences, real worker/resource release, downstream suppression and scoped recovery backup/rollback. `node --env-file=.env.local .trellis/verification/canvas_cancellation_store_check.mjs --postgres` separately exercises actual PostgreSQL SQL in connection-local temporary tables, never runtime rows. Image checks cover child termination, timeout, download cancellation and staging cleanup.

- Gallery UX: baseline `library_ui_check.mjs` executes date/URL/wire-key contracts. `python .trellis/verification/library_collection_batch_browser_check.py` covers filters/history, original viewer/drafts/zoom/cursor races, permissions, batch failures/deletion, import receipts and smart folders across three themes at 1440/390. Use worker-disabled loopback `FLUXPOST_BROWSER_BASE_URL`; it rejects 3001 and intercepts every API/image request. Evidence: library-ux task.

- `canvas_local_image_save_check.mjs` is included in the baseline. It checks real isolated file writes, exclusive naming, retry ownership/hash receipts and error paths. The separate `canvas_local_image_save_browser_check.py` checks three themes at 1440/390 using intercepted APIs on an isolated worker-disabled server via `BROWSER_BASE_URL`; it rejects port 3001. Contract: `canvas_local_image_save.md`.

- `python .trellis/verification/canvas_inspector_browser_check.py` checks initial
  hiding, node switching/editing, dismissal and desktop space recovery with the
  node library open/closed, across three themes at 1440/1000/390px. Requires an
  isolated worker-disabled loopback server via `BROWSER_BASE_URL`; rejects port
  3001 and intercepts all APIs without real workflow writes.

- Layer composition: baseline `canvas_layer_compose_check.mjs`; separate 1440/390
  browser check `canvas_layer_compose_browser_check.py`. Contract: canvas_layer_compose.md.

- Alpha masks: baseline FFmpeg/graph checks and separate 1440/390 browser command in canvas_media_mask.md.

- Image processing: baseline check `canvas_image_process_check.mjs`; browser check `canvas_image_process_browser_check.py`. Contracts and commands: canvas_image_process.md.

- Review performance: commands and measured limits in `.trellis/tasks/archive/2026-09/09-14-review-desk-performance/verification.md`.

- `canvas_iteration_contract_check.mjs`, `canvas_iteration_runtime_check.mjs`, `canvas_iteration_runs_check.mjs`, `canvas_iteration_actions_check.mjs`, and `canvas_iteration_queue_check.mjs` cover nested graph validation, multi-port snapshots, identity/order, bounded admission, repair versus delivery, owner/published guards, durable wake/park races, cancellation and SQLite recovery. PostgreSQL queue SQL is checked structurally, not against a live server. All are part of the offline baseline.
- `python .trellis/verification/canvas_iteration_browser_check.py` checks region editing, persistence, result repair/refresh and shared outputs at 1440px/390px using intercepted APIs. Use `BROWSER_BASE_URL` with an existing worker-disabled loopback smoke server; port 3001 is rejected.

- `simple_image_dimensions_check.mjs` checks settings/launch/resume. Its browser companion checks 1440px/390px persistence/layout via `BROWSER_BASE_URL`; use worker-disabled loopback, never port 3001.
- `image_background_check.mjs` and `canvas_image_models_check.mjs` cover model IDs, formats, VIP 4K/4:3, errors and redaction offline.

- `image_exact_pixels_check.mjs` covers exact request fields, unsupported ToAPIs input, PNG/JPEG byte preservation, mismatch/corrupt-output rejection before persistence, no retry/fallback, resume and auto/ratio mode using isolated fixtures.
- `node .trellis/verification/canvas_content_collection_check.mjs` covers 20 source-scoped tasks, five-port snapshots, authenticated owner propagation, opt-in tagging, vision/image executors, partial-image retry, serialization and per-node media limits using mocks. The normal baseline includes it.
- `python .trellis/verification/canvas_content_collection_browser_check.py` separately checks tagging controls, test-link persistence/reset, generic vision preset, five shared ports, 20-task preflight and 1440px/390px layout against a worker-disabled isolated smoke server. Set `BROWSER_BASE_URL`; its default is port 45678, not the live 3001 candidate. All API requests are intercepted; it never starts real collection or launches a batch.

- `simple_image_discard_check.mjs` executes the image-task functions with isolated provider/media stubs: simple-run timeout/provider/Klein failures discard slots without reading original images, successful slots survive, all ordinary failures reject, explicit keep mode and strict review remain intact, and unrelated callers retain their policy. AST checks require both simple-run reference-image entry points to disable source fallback.

The baseline verifies Trellis structure/budgets, storage/schema/ownership, content
and media workflows, Canvas execution, queues/publishing, local/deployment contracts,
lint, TypeScript, build, isolated HTTP smoke and SQLite. Its executable check list
is `.trellis/verification/check.mjs`; detailed historical scope is in the archive.

- `storage_reference_rewrite_check.mjs` covers verified-only URL rewriting,
  missing/signed-link preservation, numeric precision, idempotence and exact reversal
  without live services. Live migration acceptance is separate operator evidence.

The default baseline must not call live TikHub, text/image providers, Seedance, ComfyUI, Feishu writes, Lark replies, or simple-run production.

### Copy-Library New-Draft Regression

- The baseline's `copy_library_check.mjs` enforces selection-independent fetching, explicit new-draft preservation, saved-entry selection, and history restoration contracts.
- `python .trellis/verification/copy_library_browser_check.py` is a separate mocked Chromium interaction check requiring Python Playwright and system Chrome. Set `BROWSER_BASE_URL` to an existing worker-disabled isolated smoke server to test uncommitted builds; its default is the unchanged port-3001 candidate. All browser API requests are intercepted with in-memory fixtures.
- It covers 1440px/390px layouts, empty lists, read-only deep links, create via POST, edit via PATCH, selection without reloads, pending tags, delayed filter responses, and back/forward draft restoration. It must fail on the pre-fix build when the new title is replaced by the first existing entry.

## Candidate Release Checks

For a production candidate:

1. Build from a clean worktree rooted at current GitHub `main`.
2. Run focused checks, the baseline, TypeScript, lint, and production build.
3. Push the unchanged verified commit, merge it to `origin/main`, and verify the remote full SHA before candidate verification; a temporary branch is optional, but production parity is always against `origin/main`.
4. Run `/opt/fluxpost-studio/bin/verify-candidate.sh --ref FULL_40_CHARACTER_SHA` and require a commit-bound passing manifest before approval; this isolated gate must not read production configuration, mount runtime volumes, or activate services.
5. Run read-only production preflight.
6. Deploy only through `/opt/fluxpost-studio/bin/deploy.sh --ref FULL_40_CHARACTER_SHA` after separate explicit approval.
7. Verify identity, health, protected services, schema/auth, unchanged volumes, image-retention preview/results, two rescue tags, and the weekly BuildKit timer.
8. Require `npm run local:parity` to prove the clean local candidate, GitHub `main`, and production all use the deployed SHA.

Do not deploy a dirty worktree, branch name, abbreviated SHA, local runtime rows, or unpushed commit.

## Recent Verification

- 2026-10-28 Wonder repair: baseline domains pass before 17 existing data-script lint errors; focused lint/types/build/config/SQLite/HTTP and six Wonder plus two GPT browser cases pass. Explicitly authorized LAN activation of clean `3f71997` passed build/identity/loopback/LAN HTTP/Canvas checks. No manual paid replay. Evidence: archived wonder-image-repair task.

Prior text-reasoning and local-library acceptance entries are preserved in
`archive/verification-history.md` (2026-10-28 context-budget archive). Current
OSS evidence: `.trellis/tasks/archive/2026-10/10-28-oss-acceptance-local-cutover/verification.md`.

## Missing Coverage

- Default checks use isolated fixtures: no paid providers, real Feishu/Lark writes,
  production configuration/data, external infrastructure changes or image cleanup.
- Real migrations, authenticated runtime walkthroughs, PostgreSQL multi-user load,
  and local/GitHub/production parity need separate dated operator evidence.
- A fresh dependency audit is separate; historical advisory counts are not current
  guarantees. Never run automatic `npm audit fix --force` during verification.
- Current local OSS acceptance and remaining cutover gates are in the active
  oss-acceptance-local-cutover task; older coverage notes remain in the archive.

## Future Check Rules

- Add baseline checks only when deterministic, isolated, and non-mutating.
- Record live external checks as manual operator gates.
- A candidate SHA change invalidates previous release evidence.
- Keep recent verification to five entries and archive older detail.
- Never weaken a failing check to make the baseline pass; isolate a demonstrably unchanged blocker and run the remaining checks explicitly.
- Source-text checks that match function boundaries must accept both LF and CRLF so fresh Windows worktrees exercise the same assertions as Git archives and Linux candidates.
