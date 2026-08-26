# Project Brief

Last updated: 2026-08-26

## Project Name, Goal, Path

- Project name: FluxPost Studio.
- Package name: `social-content-studio`.
- Project path: `D:\FluxPost\social-content-studio`.
- GitHub upload remote: `https://github.com/Jacobshujun/fluxpost-studio.git`; it had no refs when checked on 2026-06-08 before the initial local snapshot upload.
- Goal confirmed from README and code: local social media content production workspace covering content harvesting, TOS-backed image libraries, AI-assisted post creation, review, and Feishu CLI publishing.

## User Roles

- Default workspace access is small-team whitelist mode for up to a few local operators. Configure it with `WORKSPACE_AUTH_MODE=whitelist`, `WORKSPACE_ALLOWED_USERS`, `WORKSPACE_ADMIN_USERS`, and `WORKSPACE_ACCESS_PASSWORD`.
- `WORKSPACE_ALLOWED_USERS` is the allow-list for account usernames. `WORKSPACE_ADMIN_USERS` is a subset of allowed usernames that may bootstrap or always receive the admin role in whitelist mode; existing admins can also assign admin role from the account menu.
- `WORKSPACE_ACCESS_PASSWORD` is only the first-admin setup key in whitelist mode. Daily sign-in uses the per-user password hash stored in `workspace_accounts`.
- Normal members can access only records stamped with their `ownerUserId`; admins can access all workspace records. Unowned legacy records are effectively admin-only because member filters require an owner match.
- Mutating workspace API routes require a signed-in workspace account before local writes, queue creation, or external provider calls. Read-only local diagnostics remain available without a browser session where explicitly supported.


## Main Flow

1. Configure environment values in `.env.local` from the README Environment section.
2. Start the local web app.
3. Search/crawl content by platform and keyword through `/content` and `/api/crawl/jobs`, batch-import supported source links into the content pool through `/content` and `/api/crawl/links`, or use `/api/simple/runs` for one-click production from keywords, exact source links, one current Dongchedi category page, Feishu task numbers, one viral source link, original prompts, or selected content-pool samples.
4. Assess harvested items with the crawl-stage content safety gate, then persist retained items into the runtime database-backed content pool.
5. Select reusable reference or vehicle assets from the authenticated TOS-backed library when needed.
6. Generate post drafts through `/api/generate` or through the simple-run one-click workflow, including text and optional image generation.
7. Review or edit drafts through `/api/review`.
8. Publish approved posts through `/api/publish/feishu` or through the simple-run publish stage, which writes a local payload and calls Feishu CLI when target Base config is available.

## Tech Stack And Startup

- Framework: Next.js 16.2.6 App Router.
- UI/runtime: React 19.2.4, TypeScript, Tailwind/PostCSS, `lucide-react`.
- Database driver: `pg` is installed for optional PostgreSQL runtime storage.
- Package manager: npm (`package-lock.json`).
- Scripts from `package.json`:
  - `npm run local`: build clean current HEAD in an inactive slot, then activate the sole local candidate on `127.0.0.1:3001` with normal workers and full-SHA identity; restore the prior slot if activation fails.
  - `npm run local:lan`: bind that candidate to `0.0.0.0:3001`; aliases: `local:restart`, `start:lan`.
  - `npm run build`: Next production build.
  - `npm run start`: Next production server.
  - `npm run local:parity`: require exact equality among clean local HEAD/runtime, GitHub `origin/main`, and production identity.
  - `npm run lark:tasks`: poll configured Feishu/Lark chats through `lark-cli` and submit explicit task commands to the local app.
  - `npm run lark:events`: consume real-time Feishu/Lark `im.message.receive_v1` events through `lark-cli event consume` and submit explicit task commands to the local app.
  - `npm run db:diagnose`: use `FLUXPOST_DIAG_DATABASE_URL` for read-only queue, log, session, lock, and PostgreSQL-setting diagnostics without printing the connection string.
  - `npm run db:migrate:postgres`: copy current SQLite runtime rows into a PostgreSQL database configured by `DATABASE_URL`.
  - `npm run lint`: ESLint.
- Local setup: run `npm install`, create `.env.local` from README, commit the verified worktree, run `npm run local`, then open `http://127.0.0.1:3001`.

## Page, API, CLI Entrypoints

- Main page: `src/app/page.tsx`.
- Content harvesting and pool desk: `src/app/content/page.tsx`.
- Root layout: `src/app/layout.tsx`.
- API routes:
  - `GET|POST /api/accounts`
  - `GET|POST|DELETE /api/accounts/session`
  - `GET /api/config`
  - `GET /api/version`
  - `GET|POST /api/canvas/subtitle-presets`; `PATCH|DELETE /api/canvas/subtitle-presets/{id}`
  - `GET /api/content-pool`
  - `GET|POST|PATCH|DELETE /api/content/items`
  - `GET|POST /api/crawl/jobs`
  - `POST /api/crawl/links`
  - `POST /api/distribution-check`
  - `POST /api/generate`
  - `POST /api/images`
  - `POST /api/lark/tasks`
  - `GET|POST /api/library/tags`
  - `GET|PATCH|DELETE /api/library/assets`
  - `GET|POST /api/production/batches`
  - `GET|POST|PATCH|DELETE /api/production/posts`
  - `POST /api/production/posts/regenerate`
  - `GET|POST /api/publish/feishu`
  - `POST /api/review`
  - `GET|POST|DELETE /api/simple/runs`
  - `GET|DELETE /api/activity`
- Feishu CLI wrapper: `src/lib/feishu-cli.ts`.

## Product And Data Rules

- Supported keyword crawl platforms in code: `wechat_channels`, `xiaohongshu`, `douyin`, `weibo`.
- Supported source-link/ID-only platforms also include `xiaopeng_bbs` and `dongchedi`. They are available through `/api/crawl/links`, simple link mode, and Lark task-launch parsing, but are not TikHub keyword crawl platforms.
- Local runtime database in this workspace: PostgreSQL on `127.0.0.1:5432` through `DATABASE_URL` in `.env.local`; do not expose the connection string.
- Fallback runtime database when `DATABASE_URL` is not configured: `data/fluxpost.db` SQLite.
- PostgreSQL schema: `db/migrations/001_initial_postgres.sql`.
- Legacy JSON files under `data/` can be used as one-time migration sources for active domains: `content-pool.json`, `batch-production.json`, `generated-posts.json`, and `execution-log.json`. `material-library.json` is retired local state and is not imported.
- Runtime database stores workspace accounts/sessions, content projects, generated posts, batch jobs, execution logs, crawl jobs, runtime posts, simple runs, and workspace settings metadata, including saved production prompts and the `/distribution-check` audit prompt.
- Runtime database also stores owner-scoped `original_batches`, `original_batch_items`, and `original_batch_queue` records for the `/original` 1-100 topic Xiaohongshu card workspace. Its worker concurrency is controlled by `WORKER_ORIGINAL_BATCH_CONCURRENCY`, default `2` and hard-capped at `8`.
- Runtime database also stores durable queues, library metadata, owner-scoped Canvas subtitle presets/timeline cache, roles, labels, overrides, and tagging jobs; media binaries remain outside PostgreSQL.
- Workspace sessions use an HttpOnly `fluxpost_session` browser cookie. In default whitelist mode, the first-admin setup key is environment-driven and not stored in the runtime database; daily account passwords are stored only as Node `scrypt` hashes.
- SQLite-to-PostgreSQL migration script: `scripts/db/migrate-sqlite-to-postgres.mjs`. It copies metadata and JSON payload rows; it does not move media binaries.
- Feishu outbox payload directory from code/README: `data/feishu-outbox/`.
- Feishu/Lark IM task-launch idempotency rows live in `lark_task_launches` and are keyed by unique `message_id`.
- Generated AI images: `public/generated/`.
- Crawled media cache and video frames: `public/media/crawl/`.
- Source-based generated posts can store final source video materials in optional `GeneratedPost.videoUrls` only when the operator enables the default-off `引用源视频素材` / `includeSourceVideo` switch; resolution prefers cached local `downloadedVideoUrl` over remote `videoUrl`.
- Reusable reference/vehicle images live in the TOS-backed `library_assets` domain; the compact home consumes accessible vehicle assets by id and freezes their public URLs into simple runs.
- Video frame extraction uses the system `ffmpeg` executable through `src/lib/media-cache.ts`.
- Ark audio extracts MP3 with FFmpeg, uploads it to Files as `user_data`, then calls Responses with `input_audio.file_id` for optional crawl/simple-run plain text. Canvas subtitles instead require one video, use local Faster Whisper acoustic word timing, keep an owner/settings/protocol-scoped timeline cache, and emit ASS hard-subtitle MP4 plus text.
- Sensitive config is environment-based and must stay out of Trellis docs: `.env.local`, `.env*`, API keys, Feishu tokens, and local user material paths when private.

## External Integrations

- 2026-06-12 ComfyUI routing update: `COMFYUI_KLEIN_ENABLED=false` is the default, so car-exterior/`杞﹀瀷缇庡浘`/people-with-car selected image tasks use the GPT-Image-2/OpenAI Images API path. Only `COMFYUI_KLEIN_ENABLED=true` plus either `COMFYUI_KLEIN_WORKFLOW_API_JSON`/`COMFYUI_KLEIN_WORKFLOW_JSON` or `COMFYUI_KLEIN_WORKFLOW_PATH` routes those strategies to the serialized local ComfyUI lane.

- TikHub API base URL/key are configured by `TIKHUB_BASE_URL` and `TIKHUB_API_KEY`.
- Video transcription is task-level opt-in: advanced keyword crawl, advanced source-link import, and simple keyword/link/Feishu runs pass `enableVideoTranscription === true` only when the operator enables the UI switch. Default-off tasks still download videos and extract frames without invoking Ark transcription.
- Ark plain-text audio uses `ARK_API_KEY` (or legacy `VOLCENGINE_ASR_APP_KEY`) plus optional base/model/prompt/timeouts/size settings. Canvas subtitle timing is local-only through `CANVAS_SUBTITLE_PYTHON_BIN`, `CANVAS_SUBTITLE_WHISPER_MODEL`, `CANVAS_SUBTITLE_WHISPER_DEVICE`, `CANVAS_SUBTITLE_WHISPER_COMPUTE_TYPE`, and `CANVAS_SUBTITLE_WHISPER_TIMEOUT_MS`; it does not fall back to Ark.
- Workspace whitelist access is configured by `WORKSPACE_AUTH_MODE=whitelist`, `WORKSPACE_ALLOWED_USERS`, `WORKSPACE_ADMIN_USERS`, and `WORKSPACE_ACCESS_PASSWORD`; do not record the real allowed user list, admin list, setup key, or account passwords in Trellis docs.
- PostgreSQL runtime storage is configured by `DATABASE_URL` and optional `DATABASE_POOL_MAX`.
- Local PostgreSQL facts confirmed on 2026-06-04: Windows service `postgresql-x64-18` is running, the client binaries live under `D:\Program Files\PostgreSQL\18\bin`, and a dedicated FluxPost Studio database/user were provisioned for the app.
- Local read-only PostgreSQL diagnostics are configured through dedicated role `fluxpost_reader` and Windows user environment variable `FLUXPOST_DIAG_DATABASE_URL`. The secret diagnostic URL must not be copied into Trellis docs. The role can read app runtime tables, safe account/session views under `diagnostics`, and PostgreSQL stats/settings for session and lock inspection.
- OpenAI-compatible text endpoints are configured by `OPENAI_*` variables.
- GPT-Image-2 image generation uses the OpenAI Images API shape. `OPENAI_IMAGE_BASE_URL` configures the primary image API base URL, `OPENAI_IMAGE_API_KEY` configures the primary image API key with `OPENAI_API_KEY` fallback, optional `OPENAI_IMAGE_BACKUP_BASE_URL` and `OPENAI_IMAGE_BACKUP_API_KEY` configure a backup image route, `OPENAI_IMAGE_ENDPOINT=images` selects Images API dispatch, and `OPENAI_IMAGE_MODEL` defaults to `gpt-image-2`. Text-to-image requests use `/images/generations`; reference-image editing/image-to-image requests use multipart `/images/edits`.
- Local ComfyUI Klein image processing is configured by `COMFYUI_BASE_URL`, `COMFYUI_KLEIN_WORKFLOW_PATH`, Klein node id env values, KSampler override env values, `COMFYUI_KLEIN_TIMEOUT_MS`, `COMFYUI_KLEIN_POLL_INTERVAL_MS`, and `COMFYUI_KLEIN_FAILURE_POLICY`. It is currently used for car-exterior source-image strategy tasks, including `车型美图`, and people-with-car source-image strategy tasks; it is serialized through `WORKER_LOCAL_IMAGE_CONCURRENCY=1`.
- Feishu CLI publishing is configured by `FEISHU_CLI_BIN`, optional `FEISHU_CLI_BITABLE_ARGS`, `FEISHU_BITABLE_APP_TOKEN`, `FEISHU_BITABLE_TABLE_ID`, and optional `FEISHU_BITABLE_FIELD_MAP`.
- Generated-post Feishu CLI publishing defaults to Base fields `动态标题`, `动态正文`, `动态素材`, `内容标签`, `内容创作来源`, and single-select `车型`; the content creation source value comes from the workspace owner display name on the generated post, with owner id as a historical fallback, `车型` comes from the simple task keyword or imported Feishu vehicle value, and `动态素材` attachment upload combines generated images plus local source videos only for posts whose `videoUrls` were populated by the source-video opt-in switch.
- Feishu task-number content import is configured by optional `FEISHU_CONTENT_IMPORT_BASE_TOKEN`, `FEISHU_CONTENT_IMPORT_TABLE_ID`, and `FEISHU_CONTENT_IMPORT_FIELD_MAP`; base token and table id default to the generated-post publish Base/table when omitted. The default read fields are `任务编号`, `动态标题`, `动态正文`, `动态素材`, and `车型`. Imported `车型` values become the content-pool keyword/project for the source items.
- Feishu distribution audit is configured by optional `FEISHU_DISTRIBUTION_CHECK_BASE_TOKEN`, `FEISHU_DISTRIBUTION_CHECK_TABLE_ID`, `FEISHU_DISTRIBUTION_CHECK_VIEW_ID`, and `FEISHU_DISTRIBUTION_CHECK_FIELD_MAP`. The default target is Base `JbpPbSIMqaD75wsZ9fAcBy9mnEe`, table `tblA0EfoAF9J4ffi`, view `vewE44G31p`; it reads `编号`, `动态标题`, `动态正文`, `动态素材`, `车型`, and writes single-select `是否分发` plus numeric `内容评分`. Operators can customize the audit prompt from `/distribution-check`; the saved prompt is stored in workspace settings as `distributionCheckPrompt`. The page enqueues durable audit jobs and polls progress instead of waiting for one long request.
- Optional Feishu IM success notification is configured by exactly one of `FEISHU_NOTIFY_CHAT_ID` or `FEISHU_NOTIFY_USER_ID`; it uses bot identity through `lark-cli im +messages-send`.
- V1/V2 Feishu/Lark conversation task launch is configured by `LARK_TASK_CHAT_IDS`, `LARK_TASK_USER_MAP`, `LARK_TASK_API_TOKEN`, `LARK_TASK_DEFAULT_PLATFORMS`, `LARK_TASK_DEFAULT_COUNT`, and `LARK_TASK_CONFIRM_ABOVE`. The local polling runner reads configured chats through bot identity, while the real-time event runner consumes `im.message.receive_v1` events; both post explicit commands to local `/api/lark/tasks`. Sender open ids must map to existing workspace account ids before a simple run is enqueued.
- The confirmed default Feishu command shape is `lark-cli base +record-batch-create --as bot --base-token {appToken} --table-id {tableId} --json @{recordPayload}`.
- Simple-mode throughput knobs include `SIMPLE_RUN_MAX_ITEMS` (fallback `500`, hard ceiling `2000`) and `SIMPLE_RUN_WORKER_CONCURRENCY` (fallback `4`, hard ceiling `10`).
- Dongchedi category Simple Runs accept exact HTTPS `/news/...` pages, cap at 30 serial drafts, disable Feishu, and use `DONGCHEDI_COOKIE_ENCRYPTION_KEY` plus `DONGCHEDI_PAGE_TASK_TIMEOUT_MS`.
- Canvas run and batch-schedule workers wake automatically on normal Node server startup. `FLUXPOST_DISABLE_BACKGROUND_WORKERS=1` disables that instrumentation bootstrap for deterministic local smoke servers; normal production/local starts must leave it unset so persisted operator-launched work resumes.
- Feishu publish queue throughput is controlled by `FEISHU_PUBLISH_WORKER_CONCURRENCY` (fallback `1`, hard ceiling `5`), with a per-owner running-job guard so Feishu CLI writes are serialized per user/owner.
- Feishu attachment-upload throughput is controlled separately by `WORKER_FEISHU_ATTACHMENT_CONCURRENCY` (fallback `3`, hard ceiling `10`) so large attachment batches do not use the same high concurrency as record creation.
- Distribution audit throughput is isolated from content collection and generation: `DISTRIBUTION_CHECK_WORKER_CONCURRENCY` defaults to `1` and caps at `3`; per-job work uses dedicated pools `WORKER_DISTRIBUTION_RECORD_CONCURRENCY` fallback `8` cap `20`, `WORKER_DISTRIBUTION_GPT_CONCURRENCY` fallback `6` cap `15`, `WORKER_DISTRIBUTION_FEISHU_READ_CONCURRENCY` fallback `8` cap `20`, and `WORKER_DISTRIBUTION_FEISHU_WRITE_CONCURRENCY` fallback `2` cap `5`.

## Deployment Facts

- The only local application runtime is the clean committed candidate on port `3001`; normal background workers are enabled. Loopback is the default binding and LAN access changes only the bind host.
- Confirmed production entry: `npm run build` followed by `npm run start`.
- Port `3001` is the only local application environment. `npm run local` builds clean current HEAD into the inactive ignored local build slot and switches only after build success; after exact-SHA push and deployment, `npm run local:parity` proves local/GitHub/production equality. Configuration and runtime data are never synchronized as code.
- `next.config.ts` sets Turbopack root to `process.cwd()`.
- GitHub-driven Ubuntu 24.04 deployment is owned by `scripts/deploy/vps-bootstrap.sh`, `scripts/deploy/vps-deploy.sh`, `scripts/deploy/vps-enable-domain.sh`, `compose.yaml`, and `docs/deployment/ubuntu-docker.md`.
- Fresh bootstrap enforces the RAM minimum, installs official Docker/Compose, generates secrets, and creates the root-only repo/releases/current/bin layout. Existing `--app-only` hosts may count enabled swap toward a 1.5 GB combined minimum but never change swap.
- Pre-domain mode sets `FLUXPOST_PROXY_ENABLED=false`, starts only PostgreSQL and app, and binds the app to `127.0.0.1:${FLUXPOST_APP_PORT:-3101}` for SSH-tunnel access. `enable-domain.sh` requires resolvable DNS, persists `FLUXPOST_PUBLIC_HOST`, enables Caddy, and verifies public HTTPS.
- Existing deployments without the new deployment keys retain compatibility defaults: proxy enabled, public host `bbs.vollov1.xyz`, and loopback app port `3101`.
- Production `38.76.210.136` is the only remote FluxPost fix/deployment target and uses Nginx for `https://flux.lightmoment.net` with app port 3101 loopback-only. `82.158.226.10` is retired and stopped. The FluxPost deployment on `104.243.21.233:29891` was permanently removed on 2026-07-23 without changing its unrelated services; `bbs.vollov1.xyz` remains an external DNS cleanup item. Production configuration/data remains forbidden.

## Not Covered Or Pending Confirmation

- Formal user roles beyond V1 `admin`/`operator`: 待确认.
- Historical staging 104 was rebuilt on 2026-07-22 and permanently retired on 2026-07-23; it is not a supported test, promotion, or deployment target.
- Generated-post Feishu target Base token and table ID for deployment: 待确认. Source-link import sync has a user-requested default target in `src/lib/config.ts`.
- Safe isolated test credentials for TikHub/OpenAI/Feishu: 待确认.
- PostgreSQL server installation, database/user provisioning, and live migration execution: confirmed locally on 2026-06-04.
- High-volume asynchronous queue schema/worker model beyond the current JSONB-backed runtime tables: 待确认.
- Whether root `.tmp-*.json` files should be deleted: 待确认; they are treated as local debug artifacts, not Trellis context.
