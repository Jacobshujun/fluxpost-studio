# Trellis Status

Last updated: 2026-07-13

## One-Line Status

FluxPost Studio uses Trellis as the active project context system. A Docker deployment is running on the VPS at `104.243.21.233` without disturbing the existing 3x-ui service.

## Current Focus

- Trellis CLI 0.6.5 is installed; `.trellis/spec/fluxpost` and `.trellis/verification` are the active context and baseline locations.
- `docs/harness.disabled/` and `scripts/harness.disabled/` are migration archives only.
- Trellis spec discovery sees `fluxpost` and `frontend` via `python ./.trellis/scripts/get_context.py --mode packages`.
- `/config` is an admin-only advanced config page. It reads `GET /api/config?advanced=1`, writes allow-listed env keys through `PATCH /api/config`, masks secrets, and writes changes to `.env.local`.
- VPS deployment is GitHub-driven. Local development happens in this Git repository, then VPS deploys from `https://github.com/Jacobshujun/fluxpost-studio.git` into `/opt/fluxpost-studio/releases/<timestamp>` with `/opt/fluxpost-studio/current` as the active symlink. Docker Compose project `fluxpost` runs `app + postgres + proxy`; app is bound to `127.0.0.1:3101`, proxy exposes `bbs.vollov1.xyz` on HTTP `:80` and HTTPS `:443`, and Postgres has no host port. The FluxPost app image includes `lark-cli` via `@larksuite/cli@1.0.67`, with `FEISHU_CLI_BIN=lark-cli`.
- Default startup context must stay under 45 KB, and typical code-task context under 70 KB. Keep this file lightweight and move history to archives when it grows.

## Next Entry

1. For a new task, start with `AGENTS.md`, this file, `.trellis/spec/fluxpost/feature_list.json`, and `.trellis/spec/fluxpost/rules.md`.
2. For config/admin work, inspect `src/lib/config.ts`, `src/app/api/config/route.ts`, `src/app/config/page.tsx`, and `.trellis/verification/advanced_config_check.mjs` first.
3. For Feishu publish issues, inspect `src/lib/feishu-cli.ts`, `src/lib/feishu-publish-queue.ts`, `src/lib/feishu-field-options.ts`, and `src/app/api/publish/feishu/route.ts` first.
4. For VPS deployment follow-up, use `ssh root@104.243.21.233 -p 29891`, then run `/opt/fluxpost-studio/bin/deploy.sh` to deploy from GitHub, or `cd /opt/fluxpost-studio/current` and `COMPOSE_PROJECT_NAME=fluxpost docker compose ps/logs`. Do not stop or restart `x-ui`, `xray`, or `frps`.
5. Before completion, read `.trellis/spec/fluxpost/verification.md` and run `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`, or explain why it could not run.

## Recent Verification

- 2026-07-13: Published the standalone ComfyUI custom node repository `Jacobshujun/gpt2-image-API` at commit `dfd22a27f0212ebe80a73ce900a38c82e3175a92`. The node provides configurable API key/request URL fields, JSON generations, multipart edits with up to three references and mask, JSON/SSE/direct-image result decoding, and ComfyUI IMAGE batch output. All 17 isolated tests, syntax compilation, package-loader simulation, sensitive-value scan, and remote hash verification passed. Registration and BHWC float32 tensor output also passed under the local ComfyUI Python environment with torch `2.8.0+cu128`. The full FluxPost baseline passed with `TRELLIS_SMOKE_PORT=45678`; existing Turbopack broad public-path warnings remain.
- 2026-07-09: VPS Docker deployment verified and migrated to GitHub-driven deployment. `/opt/fluxpost-studio/bin/deploy.sh` pulls `main`, creates a clean release, links `/opt/fluxpost-studio/shared/env.production`, builds the app image, runs Compose, and verifies local/public config endpoints. `fluxpost-app` and `fluxpost-postgres` are healthy; public `https://bbs.vollov1.xyz/api/config` returns non-sensitive config with `databaseBackend="postgres"`, `postgresConfigured=true`, `comfyUiKleinAvailable=false`, and `comfyUiKleinEnabled=false`. `fluxpost-proxy` listens on `:80` and `:443` with a Let's Encrypt certificate. `lark-cli version 1.0.67` is installed in the app container and `FEISHU_CLI_BIN=lark-cli` is active; Feishu app credentials/Base tokens remain unconfigured. Existing 3x-ui/xray/frps listeners remained on their original ports.
- 2026-07-08: Admin-only `/config` advanced environment configuration page added. `GET /api/config` remains non-sensitive; `GET /api/config?advanced=1` and `PATCH /api/config` require admin role, mask secrets, allow-listed env keys only, write `.env.local`, and refresh in-process config. Added `.trellis/verification/advanced_config_check.mjs` to baseline. `npx --no-install tsc --noEmit`, `npm run lint`, full baseline with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`, and `npm run local:restart` passed. Build still reports existing Turbopack broad public-path warnings.
- 2026-07-07: Viral imitation defaulted to GPT-Image-2 `/images/edits` dual-reference path unless the user enables Klein; focused checks, lint, type-check, and full baseline passed.
- 2026-07-07: Review desk save/approve now merges saved posts into local `/review` state and queues approve/status-change source sync in the background; focused checks, lint/type-check, full baseline, and `npm run local:restart` passed.
- 2026-07-07: Compact/simple homepage scrolling and account popover layering were fixed; focused CSS/workspace checks, lint/type-check, full baseline, and `npm run local:restart` passed.
- 2026-07-06: Standalone `/content` desk and pool-mode secondary creation are implemented; focused simple/content checks, lint/type-check, and full baseline passed.

## Current Risks

- Do not read or expose `.env.local`, `.env*`, database credentials, Feishu/Lark tokens, API keys, local account passwords, or real chat/user identifiers.
- Do not mutate `data/`, `public/generated/`, `public/media/`, debug artifacts, or runtime databases during Trellis-only work.
- Do not trigger live TikHub, OpenAI-compatible text/image providers, ComfyUI, Feishu writes, Lark replies, or simple-run production as default verification.
- Do not use `docs/harness.disabled/` or `scripts/harness.disabled/` as active context/check paths unless explicitly doing migration archaeology.
- VPS production secrets live in `/opt/fluxpost-studio/shared/env.production`; releases symlink it as `deploy/env.production`. Do not print the full file or copy secrets into Trellis/final answers.
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
