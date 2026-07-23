# Trellis Status

Last updated: 2026-07-23

## One-Line Status

Task `.trellis/tasks/07-23-remote-first-vps-validation` is implementing the mandatory 104-first release gate. Production 38 remains on `323df48`, staging 104 remains on `211aa65`, and GitHub `main` is `2fef2e5`; the new candidate has not passed remote verification yet.

## Current Focus

- `/library` reference and vehicle views are being prepared as an immutable candidate from clean `origin/main`; production promotion remains blocked until the same SHA passes the 104 candidate gate and isolated live library scenarios.
- Local Windows is now limited to clean-worktree editing, diff review, and Git operations. It no longer supplies application, build, test, or browser promotion evidence.
- Every candidate must pass the complete offline Docker gate and task-specific scenario on `104.243.21.233`, then production `38.76.210.136` may receive only the unchanged full SHA.
- The active task adds `.trellis/verification/check.mjs`, Docker target `verification`, `vps-verify-candidate.sh`, shared deploy/verify locking, deterministic contract checks, and operator documentation.
- Production 38 uses Nginx for `flux.lightmoment.net`, loopback app port 3101, persistent FluxPost volumes, and co-located Open WebUI. Ubuntu is 22.04, so use the installed wrapper rather than fresh bootstrap.
- Staging 104 uses Caddy for `bbs.vollov1.xyz`, isolated PostgreSQL/config/media state, and protected `x-ui`, `xray`, and `frps` services.
- GitHub `main` includes the HEIC/TOS review fix at `2fef2e5`; it has historical local evidence but has not passed the new 104 gate or deployed to production.
- `/config` remains admin-only. Operator base secrets stay in `shared/env.production`; admin overrides stay in the persistent `fluxpost-config` volume.
- `.trellis/` is the only active AI collaboration system. Disabled Harness directories are migration archives only.

## Next Entry

1. Finish and push the remote-first candidate commit without local application/build/test/browser validation.
2. On 104, run the temporary candidate verifier, require a passing full-SHA manifest, then deploy that SHA.
3. Verify staging release/image/container identity, app/PostgreSQL/Caddy, public HTTPS, the workflow scenario, isolation, and unchanged `x-ui`/`xray`/`frps`.
4. Fast-forward `main` without changing the verified SHA. Any changed SHA must restart the 104 gate.
5. On production 38, preview and deploy the same SHA; verify release/image/container, app/PostgreSQL, Nginx/public HTTPS, named volumes, database write, and Open WebUI.
6. Record durable remote evidence and archive the Trellis task. Do not promote documentation-only evidence commits unless application behavior changes.
7. For future bugs, start from a clean `origin/main` worktree, push the final candidate, and repeat the same 104-to-38 sequence.

## Recent Verification

- 2026-07-23: HEIC/TOS delivery fixtures, focused checks, lint, TypeScript, build, full Windows baseline, local smoke, and restart passed before the remote-first policy changed. Commit `2fef2e5` is not remotely approved or deployed.
- 2026-07-23: Production 38 deployed `323df48998092ccf3a3d8ff9b3728f2cb60f4a15`; release/image identity, app/PostgreSQL, loopback/public HTTP, Nginx, and unchanged Open WebUI passed.
- 2026-07-22: Production 38 deployed `211aa65`; release/image, HTTPS, volumes, database write, Nginx, and Open WebUI passed. Retired 82 was stopped without deleting data.
- 2026-07-22: Staging 104 deployed `211aa65`; app/PostgreSQL/Caddy, TLS, isolated account/volumes, database read/write, and protected `frps`/`x-ui`/`xray` passed.
- Older verification evidence is preserved in `.trellis/spec/fluxpost/verification.md` and `.trellis/spec/fluxpost/archive/verification-history.md`.

## Current Risks

- `main` is ahead of production and staging. Never deploy a moving branch; bind verification and deployment to the exact resolved SHA.
- The verifier is not installed on 104 until the first remote-first candidate deploys. Run it from a temporary root-owned path once, then confirm the installed wrapper exists.
- Candidate verification must not read environment files, mount named volumes, invoke Compose, change `current`, or call paid/live providers.
- Never copy production accounts, database data, media, TOS prefixes, Feishu targets, provider credentials, or Docker volumes to 104.
- Production-only integration probes require separate operator approval and must be minimal, observable, and reversible.
- Do not expose `.env*`, database credentials, API keys, Feishu/Lark tokens, local passwords, or real user identifiers in commands, Git, Trellis, logs, or responses.
- Do not remove `fluxpost-config`, PostgreSQL, data, media, node-home, or proxy certificate volumes during deploy or rollback.
- `@volcengine/tos-sdk@2.9.1` retains upstream Axios advisories; keep TLS verification enabled and configuration admin-only.

## Necessary History Paths

- Handoff history: `.trellis/spec/fluxpost/archive/handoff-history-2026-06-17.md`
- Progress history: `.trellis/spec/fluxpost/archive/progress-history-2026-06-17.md`
- Verification history: `.trellis/spec/fluxpost/archive/verification-history.md`
- Feature evidence history: `.trellis/spec/fluxpost/archive/feature-list-history-2026-06-17.json`
- Previous pitfalls: `.trellis/spec/fluxpost/archive/pitfalls-history-2026-06-17.md`
- Previous architecture rules: `.trellis/spec/fluxpost/archive/architecture-rules-history-2026-06-17.md`

## Handoff Minimum Standard

After reading `AGENTS.md`, this file, `feature_list.json`, and `rules.md`, a new session must know the current task, next command boundary, required remote evidence, and prohibited production/staging actions. Keep this file lightweight; move detailed logs to verification history or the active task research directory.
