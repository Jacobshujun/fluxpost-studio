# Trellis Status

Last updated: 2026-07-20

## One-Line Status

FluxPost Studio uses Trellis as the active project context system. A Docker deployment is running on the VPS at `104.243.21.233` without disturbing the existing 3x-ui service.

## Current Focus

- Image provider profiles are deployed at `8ee3498` on `82.158.226.10`; primary/backup remain on the existing `auto` ToAPIs configuration, and the new paid admin probe remains intentionally unrun.
- Task `.trellis/tasks/07-20-tos-runtime-media-storage` is deployed at commit `0039408` on `82.158.226.10`. TOS is configured and enabled after a deployment-environment probe passed upload, HEAD, anonymous GET, Range `206`, and cleanup; the feature remains `ready_for_review` until a normally authenticated admin runs the UI check and a real FluxPost media workflow persists TOS URLs.
- Trellis CLI 0.6.5 is installed; `.trellis/spec/fluxpost` and `.trellis/verification` are the active context and baseline locations.
- `docs/harness.disabled/` and `scripts/harness.disabled/` are migration archives only.
- Trellis spec discovery sees `fluxpost` and `frontend` via `python ./.trellis/scripts/get_context.py --mode packages`.
- `/config` is an admin-only advanced config page. It reads `GET /api/config?advanced=1`, writes allow-listed env keys through `PATCH /api/config`, and masks secrets. Local development writes `.env.local`; Docker production writes `/app/config/.env.local` in the persistent `fluxpost-config` volume and reloads those overrides before `appConfig` initialization.
- Xiaohongshu keyword search and all detail consumers use TikHub App V2. Exact source-link import and keyword-result enrichment use the App V2 image/video detail endpoints, and the TikHub request boundary rejects provider business failures even when transport status is HTTP 200.
- VPS deployment is GitHub-driven. Local development happens in this Git repository, then VPS deploys from `https://github.com/Jacobshujun/fluxpost-studio.git` into `/opt/fluxpost-studio/releases/<timestamp>` with `/opt/fluxpost-studio/current` as the active symlink. Docker Compose project `fluxpost` runs `app + postgres + proxy`; app is bound to `127.0.0.1:3101`, proxy exposes `bbs.vollov1.xyz` on HTTP `:80` and HTTPS `:443`, and Postgres has no host port. The FluxPost app image includes `lark-cli` via `@larksuite/cli@1.0.67`, with `FEISHU_CLI_BIN=lark-cli`.
- Fresh Ubuntu 24.04 VPS installation uses `scripts/deploy/vps-bootstrap.sh`. Without a domain it starts only app/PostgreSQL on loopback for SSH-tunnel access; `/opt/fluxpost-studio/bin/enable-domain.sh <hostname>` later enables Caddy/HTTPS. Updates remain `/opt/fluxpost-studio/bin/deploy.sh`, and `deploy.sh --check` previews the mode without changing services.
- Default startup context must stay under 45 KB, and typical code-task context under 70 KB. Keep this file lightweight and move history to archives when it grows.

## Next Entry

1. Continue `.trellis/tasks/07-20-tos-runtime-media-storage` with a normal administrator login: run the `/config` TOS check, then create at least one real image and video workflow and confirm stored URLs use the configured TOS base/prefix while successful files do not remain in public volumes. If those checks pass, mark the feature `done` and archive the task. Do not touch `104.243.21.233`.
2. For a new task, start with `AGENTS.md`, this file, `.trellis/spec/fluxpost/feature_list.json`, and `.trellis/spec/fluxpost/rules.md`.
3. For config/admin work, inspect `src/lib/config.ts`, `src/app/api/config/route.ts`, `src/app/config/page.tsx`, and `.trellis/verification/advanced_config_check.mjs` first.
4. For Feishu publish issues, inspect `src/lib/feishu-cli.ts`, `src/lib/feishu-publish-queue.ts`, `src/lib/feishu-field-options.ts`, and `src/app/api/publish/feishu/route.ts` first.
5. For VPS deployment follow-up, use `ssh root@104.243.21.233 -p 29891`, then run `/opt/fluxpost-studio/bin/deploy.sh` to deploy from GitHub, or `cd /opt/fluxpost-studio/current` and `COMPOSE_PROJECT_NAME=fluxpost docker compose ps/logs`. Do not stop or restart `x-ui`, `xray`, or `frps`.
6. For a fresh VPS, follow `docs/deployment/ubuntu-docker.md`; do not copy old VPS secrets or volumes into GitHub.
7. Before completion, read `.trellis/spec/fluxpost/verification.md` and run `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`, or explain why it could not run.

## Recent Verification

- 2026-07-21: ToAPIs commits `d9095ea`/`4a9bd8e` deployed to release `20260721-061557`. Service health passed; paid text/reference probes produced distinct durable TOS images without fallback.

- 2026-07-20: Commits `303e597` and `0039408` were pushed and deployed only to `82.158.226.10`. The first build exposed a Windows-generated optional-dependency lock gap; a Linux-generated lock then passed container `npm ci` and deployment. TOS values were written to the persistent config volume through stdin without output, the app was enabled only after the deployed-config direct probe passed upload/HEAD/anonymous GET/Range `206`/delete, and app/PostgreSQL/Open WebUI, Nginx, public HTTPS, chat/sd/run/aitool, no FluxPost proxy, TLS verification, and sampled historical local media all remained healthy. A normal authenticated admin check and real application media write remain pending.
- 2026-07-15: Added a fresh Ubuntu 24.04 one-command bootstrap, private pre-domain SSH-tunnel mode, later one-command Caddy/HTTPS enablement, configurable loopback port/domain, and non-mutating `deploy.sh --check`. Deterministic tests parse Compose, run Bash syntax, execute private/HTTPS/legacy plans, guard all named volumes, and reject SSH/firewall/destructive-volume commands. Focused checks and the full Trellis baseline passed; build retains 15 Turbopack path-tracing warnings. No live second-VPS install, DNS change, Docker operation, or external provider call was performed.
- 2026-07-14: Migrated Xiaohongshu source-link and keyword-enrichment details from removed TikHub Web/Web V3 endpoints to App V2 image/video details. Added request-boundary business-envelope validation and offline regression coverage for image/video normalization, image-to-video fallback, HTTP-200 `status=461` failure, and old-endpoint absence. Focused checks, type-check, lint, build, and the full Trellis baseline passed without live external calls; existing 15 Turbopack warnings remain.
- 2026-07-14: Fixed advanced configuration loss across Docker app-container replacement. Production now mounts `fluxpost-config` at `/app/config`, sets `FLUXPOST_CONFIG_FILE=/app/config/.env.local`, loads persisted values over the base Compose environment before `appConfig` initialization, and retains empty tombstones so cleared base values do not return after restart. Focused checks, an isolated fresh-process precedence/clear smoke, type-check, lint, build, and the full Trellis baseline passed; the existing 15 Turbopack broad-path warnings remain.
- 2026-07-13: Fixed local discovery for `GPT2-image-run`: the plugin was cloned to `D:\Comfyui\comfyui\custom_nodes\gpt2-image-run` after the active ComfyUI process had started, so it was absent from `/object_info`. Fully restarted ComfyUI on `127.0.0.1:8188`; startup logs now list `gpt2-image-run`, and `/object_info/GPT2ImageRun` returns display name `GPT2-image-run`, category `image/api`, all expected inputs, `IMAGE` output, and search aliases.
- 2026-07-13: Published `Jacobshujun/gpt2-image-run` at commit `e23aa62ca8a6d00dce9317b90d292e1ac73a4f02`. The standalone ComfyUI node calls RunningHub's official GPT Image 2 image-to-image endpoint with the exact five-field JSON contract, returns downloaded results as a BHWC float32 `IMAGE` batch, compacts HTTP 524 diagnostics, and redacts keys and signed URLs. All 10 mocked tests, syntax compilation, cached-diff checks, sensitive-value scanning, local ComfyUI Python loading, remote hash verification, and the full FluxPost baseline passed; no live paid generation was run. Existing 15 Turbopack broad-path warnings remain.
- 2026-07-13: Fixed the published ComfyUI node discovery issue in `Jacobshujun/gpt2-image-API` at commit `2173700` by adding ComfyUI `SEARCH_ALIASES` (`gpt2-image`, `gpt-image-2`, OpenAI/image API, and Chinese aliases). Fast-forwarded the live clone at `D:\Comfyui\comfyui\custom_nodes\gpt2-image-API`, restarted the local `127.0.0.1:8188` ComfyUI process, verified `/object_info/GPTImage2CustomAPI` exposes the aliases, and confirmed the frontend path `添加节点 -> 图像 -> API -> GPT Image 2 - Custom API`.
- 2026-07-13: Published the standalone ComfyUI custom node repository `Jacobshujun/gpt2-image-API` at commit `dfd22a27f0212ebe80a73ce900a38c82e3175a92`. The node provides configurable API key/request URL fields, JSON generations, multipart edits with up to three references and mask, JSON/SSE/direct-image result decoding, and ComfyUI IMAGE batch output. All 17 isolated tests, syntax compilation, package-loader simulation, sensitive-value scan, and remote hash verification passed. Registration and BHWC float32 tensor output also passed under the local ComfyUI Python environment with torch `2.8.0+cu128`. The full FluxPost baseline passed with `TRELLIS_SMOKE_PORT=45678`; existing Turbopack broad public-path warnings remain.
- 2026-07-09: VPS Docker deployment verified and migrated to GitHub-driven deployment. `/opt/fluxpost-studio/bin/deploy.sh` pulls `main`, creates a clean release, links `/opt/fluxpost-studio/shared/env.production`, builds the app image, runs Compose, and verifies local/public config endpoints. `fluxpost-app` and `fluxpost-postgres` are healthy; public `https://bbs.vollov1.xyz/api/config` returns non-sensitive config with `databaseBackend="postgres"`, `postgresConfigured=true`, `comfyUiKleinAvailable=false`, and `comfyUiKleinEnabled=false`. `fluxpost-proxy` listens on `:80` and `:443` with a Let's Encrypt certificate. `lark-cli version 1.0.67` is installed in the app container and `FEISHU_CLI_BIN=lark-cli` is active; Feishu app credentials/Base tokens remain unconfigured. Existing 3x-ui/xray/frps listeners remained on their original ports.
- 2026-07-08: Admin-only `/config` advanced environment configuration page added. `GET /api/config` remains non-sensitive; `GET /api/config?advanced=1` and `PATCH /api/config` require admin role, mask secrets, allow-listed env keys only, write `.env.local`, and refresh in-process config. Added `.trellis/verification/advanced_config_check.mjs` to baseline. `npx --no-install tsc --noEmit`, `npm run lint`, full baseline with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`, and `npm run local:restart` passed. Build still reports existing Turbopack broad public-path warnings.
- 2026-07-07: Viral imitation defaulted to GPT-Image-2 `/images/edits` dual-reference path unless the user enables Klein; focused checks, lint, type-check, and full baseline passed.
- 2026-07-07: Review desk save/approve now merges saved posts into local `/review` state and queues approve/status-change source sync in the background; focused checks, lint/type-check, full baseline, and `npm run local:restart` passed.
- 2026-07-07: Compact/simple homepage scrolling and account popover layering were fixed; focused CSS/workspace checks, lint/type-check, full baseline, and `npm run local:restart` passed.
- 2026-07-06: Standalone `/content` desk and pool-mode secondary creation are implemented; focused simple/content checks, lint/type-check, and full baseline passed.

## Current Risks

- TOS secrets from the operator-provided `TOS.txt` must never appear in commands, logs, Git, Trellis, or responses. The target container must not inherit `NODE_TLS_REJECT_UNAUTHORIZED=0`; keep TOS disabled if the admin public-read/Range/delete probe fails.
- `@volcengine/tos-sdk@2.9.1` currently depends on Axios versions with published high-severity advisories and no upstream SDK fix. Keep endpoint configuration admin-only, HTTPS verification enabled, SDK proxy/retry behavior constrained, and revisit the dependency when a fixed release exists.
- Do not read or expose `.env.local`, `.env*`, database credentials, Feishu/Lark tokens, API keys, local account passwords, or real chat/user identifiers.
- Do not mutate `data/`, `public/generated/`, `public/media/`, debug artifacts, or runtime databases during Trellis-only work.
- Do not trigger live TikHub, OpenAI-compatible text/image providers, ComfyUI, Feishu writes, Lark replies, or simple-run production as default verification.
- Do not use `docs/harness.disabled/` or `scripts/harness.disabled/` as active context/check paths unless explicitly doing migration archaeology.
- VPS operator-managed base secrets live in `/opt/fluxpost-studio/shared/env.production`; admin-managed overrides live in the `fluxpost_fluxpost-config` Docker volume. Do not print either source, copy secrets into Trellis/final answers, or remove the config volume during routine cleanup.
- Existing VPS services include 3x-ui/xray/frps. Do not bind FluxPost to ports already used by those services; current FluxPost public exposure is `bbs.vollov1.xyz` on HTTP `:80` and HTTPS `:443`, with app loopback `127.0.0.1:3101`.
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
