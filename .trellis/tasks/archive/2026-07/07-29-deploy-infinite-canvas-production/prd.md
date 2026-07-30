# Deploy Infinite Canvas To Production 38

## Goal

Make the existing infinite-canvas workspace available at `https://flux.lightmoment.net/canvas` on the supported production host `38.76.210.136`, without migrating local Canvas history or weakening the current production deployment and data boundaries.

## Background

- Production 38 currently runs release `20260723-113938-542cbb5e2d1f` and uses Nginx in front of the loopback-only FluxPost app on port 3101.
- GitHub `main` currently resolves to `0f6e499938ab1cf1dedd04230f2ff56d1dafd78f` and does not contain the Canvas implementation.
- The locally verified Canvas implementation is carried by commits `164cb9e` (core workflows/common nodes) and `6227c7e` (copy library and batch scheduler), but the local branch diverged from GitHub `main`.
- Deploying local `2279f31` directly would roll production back across later HEIC, library, verification, and deployment changes. It is forbidden.
- The working tree contains unrelated user changes and debug artifacts. They must not be swept into the production candidate.

## Requirements

- Create a clean integration candidate based on current GitHub `main`, preserving all existing production changes while adding the complete Canvas page, API, domain, persistence, worker, copy-library, and scheduler behavior required by the two Canvas implementation commits.
- Do not deploy a dirty working tree, an unpushed commit, a branch name, or an abbreviated SHA. Deploy only a verified full commit SHA reachable from the GitHub remote.
- Do not migrate local Canvas workflows, runs, queue rows, generated media, accounts, runtime data, or secrets.
- Preserve production PostgreSQL data, Docker named volumes, Nginx, Open WebUI, and unrelated services.
- Keep Canvas background workers enabled in production. Do not set `FLUXPOST_DISABLE_BACKGROUND_WORKERS=1` outside isolated smoke processes.
- Run deterministic local verification without live TikHub, paid text/image providers, ComfyUI, Feishu writes, or Lark replies.
- Before deployment, capture non-secret production release, app/PostgreSQL, Nginx/public HTTPS, and protected-service health.
- Deploy through the existing exact-ref release wrapper so failed health checks automatically restore the previous release.
- After deployment, verify release/manifest/image identity, `/canvas` HTTP availability, Canvas API authentication boundaries, required PostgreSQL tables, app/PostgreSQL health, Nginx HTTPS, and protected-service health.

## Acceptance Criteria

- [x] A clean candidate based on GitHub `main` contains the complete intended Canvas code and no unrelated local debug artifacts.
- [x] Candidate lint, TypeScript, Canvas checks, production build, and project baseline pass, or a demonstrably unrelated pre-existing blocker is isolated and documented while all candidate files pass focused checks.
- [x] The candidate is pushed to GitHub and the deployed full SHA matches the candidate SHA.
- [x] Production deployment completes through the release wrapper without deleting or replacing persistent volumes.
- [x] `https://flux.lightmoment.net/canvas` returns HTTP 200 and renders the Canvas route for signed-in operators.
- [x] Unsigned Canvas API requests retain the expected authentication response and do not expose workspace data.
- [x] The Canvas PostgreSQL workflow, schedule, run, node-run, and queue tables exist after startup.
- [x] Production app/PostgreSQL, Nginx/public HTTPS, and Open WebUI remain healthy after deployment.
- [x] No live paid provider call, Feishu write, local-history migration, or runtime-data mutation beyond normal schema initialization occurs during verification.
- [x] The previous production release remains available for rollback and is restored if any required health or compatibility check fails.

## Out Of Scope

- Migrating local Canvas workflows, run history, queue state, media, accounts, or configuration.
- Running real GPT image/text, Seedance, TikHub, ComfyUI, or Feishu jobs as part of this deployment.
- Changing DNS, Nginx routing, SSH, firewall rules, Docker volumes, or unrelated VPS services.
- Shipping unrelated local library sorting, tag-input, or debug-artifact changes unless they are proven required to resolve an integration conflict.
- Completing the later full-feature branch convergence; this task documents that follow-up path but deploys only the approved Canvas release scope.

## Approved Scope Decision

The user approved a Canvas-only first-stage production release. Unrelated current working-tree changes remain excluded and will be considered later through the documented full-feature convergence path.
