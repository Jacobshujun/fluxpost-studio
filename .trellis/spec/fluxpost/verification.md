# Verification

Last updated: 2026-07-23

## Baseline Command

Every code-fix candidate is verified on staging 104 before deployment:

```bash
sudo /opt/fluxpost-studio/bin/verify-candidate.sh --check --ref CANDIDATE_REF
sudo /opt/fluxpost-studio/bin/verify-candidate.sh --ref CANDIDATE_REF
```

The verifier runs the cross-platform baseline through Docker target `verification`. The repository entry remains available for isolated development of the verification system itself, and `check.ps1` forwards to it for Windows compatibility:

```bash
npm run trellis:check
```

## Current Automated Checks

`.trellis/verification/check.mjs` currently verifies:

- Trellis file existence and feature-state validity using the same contracts formerly held in the PowerShell-only entry.
- Trellis context budgets and `TRELLIS-LATEST` marker sizes.
- Handoff validity and feature evidence requirements.
- JSON parse checks for project JSON, `.trellis/spec/fluxpost/feature_list.json`, and existing legacy `data/*.json`.
- Static/domain checks for PostgreSQL schema, workspace accounts, advanced config admin boundaries, TOS runtime media storage/consumption and secret masking, Ubuntu VPS deployment/Compose/shell contracts, execution logs, platform request mapping, media handling, video download fallback, video-frame policy, source-video final material references and default-off opt-in, video transcription wiring, concurrency, Feishu publish/resume/queue/vehicle-option paths, simple-run policies, content desk and pool-mode secondary creation, viral/original modes, review preview/workflow/desktop scroll layout behavior, source safety, source import retirement, Feishu content import, durable distribution audit queue/progress, Lark task launch, crawl strategy sync, source-link importers, simple queue/persistence, title/image prompt guards, image-generation toggle behavior, GPT-Image-2/ToAPIs async request shape, ComfyUI Klein wiring, source tagging image preprocessing, and row-level runtime mutations.
- `npm run lint`.
- `npx --no-install tsc --noEmit`.
- `npm run build`.
- Isolated production startability smoke on `127.0.0.1:3310` inside the verification target, overrideable with `TRELLIS_SMOKE_PORT`.
- SQLite store validation through `node .trellis/verification/db_check.mjs`.

The baseline must not call live TikHub, OpenAI-compatible text/image services, image providers, ComfyUI, Feishu writes, Lark replies, or simple-run production workflows.

After the offline manifest passes, deploy the recorded full SHA to 104 and verify release/image/container identity, app/PostgreSQL/Caddy health, public HTTPS, the task-specific scenario, staging isolation, and unchanged `x-ui`/`xray`/`frps`. Only that unchanged SHA may proceed to production 38.

## Staging Smoke Command

After candidate deployment on 104, the generic HTTP smoke can run against its public endpoint without invoking paid providers:

```bash
node .trellis/verification/http_smoke.js https://bbs.vollov1.xyz
```

## Recent Verification

- 2026-07-23: Candidate `542cbb5e2d1f49539393a7d51a798b7e9e0ff18f` passed the 104 Docker verifier with manifest `result=passed`, then deployed as staging release `20260723-035052-542cbb5e2d1f`; app/PostgreSQL/Caddy, HTTPS, and protected-service baselines passed. The operator confirmed the isolated live reference/vehicle scenarios passed, including TOS and GPT/delete behavior. GitHub `main` fast-forwarded to the unchanged SHA. Production 38 deployed release `20260723-113938-542cbb5e2d1f`; manifest/image/container identity, app/PostgreSQL, loopback/public HTTPS, `/library`, Nginx, six persistent volumes, rolled-back database write, new library tables, idle queues, configured TOS/OpenAI status, enabled TLS verification, and unchanged healthy Open WebUI passed.

- 2026-07-21: Image provider profiles `8ee3498` passed focused JSON/SSE/ToAPIs/failover/config checks, type-check, lint, full baseline on port 45678, and local restart. Release `20260721-100637` deployed only to `82.158.226.10`; app/PostgreSQL/Open WebUI, Nginx, loopback/public HTTPS, target commit, and proxy absence passed. Existing production config remained unchanged and resolved both routes to `toapis_async`; the paid admin probe was not run.

- 2026-07-21: ToAPIs focused checks, TypeScript, lint, build, local restart, and full baseline passed. Commits `d9095ea`/`4a9bd8e` deployed healthy to `82.158.226.10`; paid text/reference probes returned distinct durable TOS images without fallback. A complex reference exceeded 180 seconds, later completed provider-side, and was recovered through the same persistence boundary.

- 2026-07-20: `.trellis/verification/tos_runtime_media_check.mjs`, lint, type-check, build, the full baseline on port 45678, and `npm run local:restart` passed. Commits `303e597` and Linux-lock fix `0039408` deployed to `82.158.226.10`; Linux `npm ci`, app/PostgreSQL/Open WebUI health, Nginx, loopback/public `/api/config`, `tosConfigured=true`, `tosEnabled=true`, absence of FluxPost proxy, unset `NODE_TLS_REJECT_UNAUTHORIZED`, chat/sd/run/aitool HTTPS, and sampled historical media Range `206` passed. Before enabling, a temporary dependency-stage container using the deployed persistent config verified object-level upload, HEAD length/ETag, anonymous GET, video Range `206`, and DELETE, then its image was removed. The admin route still returns boolean-only HTTP 401 without authentication; a normal authenticated admin button run and real FluxPost media production remain outstanding.

- 2026-07-14: Full baseline passed with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` after migrating Xiaohongshu exact-link and keyword-enrichment detail requests from removed TikHub Web/Web V3 APIs to App V2 image/video detail endpoints. Offline coverage verifies image and video response normalization, image-to-video fallback order, rejection of HTTP-200 `data.ok=false`/`data.status=461` business failures, and absence of removed endpoint strings. `npx --no-install tsc --noEmit`, `npm run lint`, and `npm run build` passed; the existing 15 Turbopack broad-path warnings remain. No live TikHub/OpenAI/image-provider/Feishu call was made.

## Missing Coverage

- TOS has real application image evidence; authenticated `/config` and real video checks remain.

- No unit test script is defined in `package.json`.
- No isolated live TikHub, OpenAI-compatible, image-provider, ComfyUI, Feishu, or Lark integration test is part of the default baseline.
- No default end-to-end test posts to `POST /api/simple/runs`, because that workflow can call external providers and Feishu publishing.
- No authenticated browser UI walkthrough is part of the offline baseline; task-specific browser acceptance runs against 104 when required.
- No live PostgreSQL service migration or multi-user concurrency test is part of the default baseline.
- No default check installs packages or performs a real clean-host Ubuntu bootstrap, DNS change, Caddy certificate request, or firewall operation. The deployment check parses Compose, runs Bash syntax, and executes private/HTTPS/legacy `deploy.sh --check` plans without Docker or network access.
- `ffmpeg` availability is verified for image-edit reference canvas preparation, but real video frame extraction is not verified by default.

## Future Check Rules

- Add new baseline checks only when they are deterministic, isolated, and do not mutate staging/production runtime data.
- If a check needs live external services, document it as a manual verification target instead of adding it to the default baseline.
- A candidate SHA change invalidates all previous staging evidence. Verify and deploy the new SHA on 104 before production.
- Keep recent verification to the latest 5 entries. Move older verification history to `.trellis/spec/fluxpost/archive/verification-history.md` or monthly archive files.

## History

- Full pre-migration verification history is preserved at `.trellis/spec/fluxpost/archive/verification-history.md`.
