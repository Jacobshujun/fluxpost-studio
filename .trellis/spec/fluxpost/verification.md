# Verification

Last updated: 2026-07-20

## Baseline Command

Run from the project root:

```powershell
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

Equivalent npm shortcut:

```powershell
npm run trellis:check
```

## Current Automated Checks

`.trellis/verification/check.ps1` currently verifies:

- Trellis file existence and feature-state validity through `.trellis/verification/init.ps1`.
- Trellis context budgets and `TRELLIS-LATEST` marker sizes.
- Handoff validity through `.trellis/verification/handoff.ps1`.
- JSON parse checks for project JSON, `.trellis/spec/fluxpost/feature_list.json`, and existing legacy `data/*.json`.
- Static/domain checks for PostgreSQL schema, workspace accounts, advanced config admin boundaries, TOS runtime media storage/consumption and secret masking, Ubuntu VPS deployment/Compose/shell contracts, execution logs, platform request mapping, media handling, video download fallback, video-frame policy, source-video final material references and default-off opt-in, video transcription wiring, concurrency, Feishu publish/resume/queue/vehicle-option paths, simple-run policies, content desk and pool-mode secondary creation, viral/original modes, review preview/workflow/desktop scroll layout behavior, source safety, source import retirement, Feishu content import, durable distribution audit queue/progress, Lark task launch, crawl strategy sync, source-link importers, simple queue/persistence, title/image prompt guards, image-generation toggle behavior, GPT-Image-2/ToAPIs async request shape, ComfyUI Klein wiring, source tagging image preprocessing, and row-level runtime mutations.
- `npm run lint`.
- `npx --no-install tsc --noEmit`.
- `npm run build`.
- Local production startability smoke on `127.0.0.1:3310` by default, overrideable with `TRELLIS_SMOKE_PORT`. On this Windows host, `3310` is in an excluded TCP range, so use `TRELLIS_SMOKE_PORT=45678`.
- SQLite store validation through `node .trellis/verification/db_check.mjs`.

The baseline must not call live TikHub, OpenAI-compatible text/image services, image providers, ComfyUI, Feishu writes, Lark replies, or simple-run production workflows.

## Manual Smoke Command

When a local server is already running:

```powershell
node .trellis/verification/http_smoke.js http://127.0.0.1:3000
```

For the local production server on port `3001`, use:

```powershell
node .trellis/verification/http_smoke.js http://127.0.0.1:3001
```

## Recent Verification

- 2026-07-21: Image provider profiles `8ee3498` passed focused JSON/SSE/ToAPIs/failover/config checks, type-check, lint, full baseline on port 45678, and local restart. Release `20260721-100637` deployed only to `82.158.226.10`; app/PostgreSQL/Open WebUI, Nginx, loopback/public HTTPS, target commit, and proxy absence passed. Existing production config remained unchanged and resolved both routes to `toapis_async`; the paid admin probe was not run.

- 2026-07-21: ToAPIs focused checks, TypeScript, lint, build, local restart, and full baseline passed. Commits `d9095ea`/`4a9bd8e` deployed healthy to `82.158.226.10`; paid text/reference probes returned distinct durable TOS images without fallback. A complex reference exceeded 180 seconds, later completed provider-side, and was recovered through the same persistence boundary.

- 2026-07-20: `.trellis/verification/tos_runtime_media_check.mjs`, lint, type-check, build, the full baseline on port 45678, and `npm run local:restart` passed. Commits `303e597` and Linux-lock fix `0039408` deployed to `82.158.226.10`; Linux `npm ci`, app/PostgreSQL/Open WebUI health, Nginx, loopback/public `/api/config`, `tosConfigured=true`, `tosEnabled=true`, absence of FluxPost proxy, unset `NODE_TLS_REJECT_UNAUTHORIZED`, chat/sd/run/aitool HTTPS, and sampled historical media Range `206` passed. Before enabling, a temporary dependency-stage container using the deployed persistent config verified object-level upload, HEAD length/ETag, anonymous GET, video Range `206`, and DELETE, then its image was removed. The admin route still returns boolean-only HTTP 401 without authentication; a normal authenticated admin button run and real FluxPost media production remain outstanding.

- 2026-07-14: Full baseline passed with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` after migrating Xiaohongshu exact-link and keyword-enrichment detail requests from removed TikHub Web/Web V3 APIs to App V2 image/video detail endpoints. Offline coverage verifies image and video response normalization, image-to-video fallback order, rejection of HTTP-200 `data.ok=false`/`data.status=461` business failures, and absence of removed endpoint strings. `npx --no-install tsc --noEmit`, `npm run lint`, and `npm run build` passed; the existing 15 Turbopack broad-path warnings remain. No live TikHub/OpenAI/image-provider/Feishu call was made.

- 2026-07-14: Full baseline passed with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` after persisting admin advanced configuration in the Docker `fluxpost-config` named volume. Focused coverage verifies the explicit production config path, mount declaration and ownership, override loading before `appConfig`, and persistent clear tombstones. An isolated fresh production process also confirmed a persisted value overrides the base environment and an empty persisted assignment clears an inherited value. `npx --no-install tsc --noEmit`, `npm run lint`, and `npm run build` passed; the existing 15 Turbopack broad-path warnings remain.

- 2026-07-08: Full baseline passed with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` after adding admin-only `/config` advanced environment configuration. Focused coverage in `.trellis/verification/advanced_config_check.mjs` verifies plain `/api/config` remains non-sensitive, advanced read/write requires admin, secrets are masked, config writes are allow-listed and update `.env.local`, and the main navigation exposes `/config` only to admins. `npx --no-install tsc --noEmit`, `npm run lint`, and `npm run local:restart` also passed. Build still has existing Turbopack broad public-path warnings.

- 2026-07-07: Full baseline passed with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` after making viral imitation default to GPT-Image-2 `/images/edits` dual-reference generation unless the user explicitly enables Klein, and keeping strict reference role wording under `VIRAL_IMAGE_IMITATION_PROMPT` instead of a separate hard-constraint environment variable. Focused coverage in `.trellis/verification/image_task_fallback_check.mjs`, `.trellis/verification/viral_replication_regression_check.mjs`, `.trellis/verification/simple_viral_run_check.mjs`, and `.trellis/verification/comfyui_klein_check.mjs` verifies exactly two `/images/edits` references and viral Klein routing respects the simple-run switch. Build still has existing Turbopack broad public-path warnings.

## Missing Coverage

- TOS has real application image evidence; authenticated `/config` and real video checks remain.

- No unit test script is defined in `package.json`.
- No isolated live TikHub, OpenAI-compatible, image-provider, ComfyUI, Feishu, or Lark integration test is part of the default baseline.
- No default end-to-end test posts to `POST /api/simple/runs`, because that workflow can call external providers and Feishu publishing.
- No browser UI walkthrough is part of the baseline.
- No live PostgreSQL service migration or multi-user concurrency test is part of the default baseline.
- No default check installs packages or performs a real clean-host Ubuntu bootstrap, DNS change, Caddy certificate request, or firewall operation. The deployment check parses Compose, runs Bash syntax, and executes private/HTTPS/legacy `deploy.sh --check` plans without Docker or network access.
- `ffmpeg` availability is verified for image-edit reference canvas preparation, but real video frame extraction is not verified by default.

## Future Check Rules

- Add new baseline checks only when they are deterministic, local, and do not mutate production/runtime data.
- If a check needs live external services, document it as a manual verification target instead of adding it to the default baseline.
- Keep recent verification to the latest 5 entries. Move older verification history to `.trellis/spec/fluxpost/archive/verification-history.md` or monthly archive files.

## History

- Full pre-migration verification history is preserved at `.trellis/spec/fluxpost/archive/verification-history.md`.
