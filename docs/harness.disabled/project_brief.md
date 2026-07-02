# Project Brief

Last updated: 2026-06-25

## Project Name, Goal, Path

- Project name: FluxPost Studio.
- Package name: `social-content-studio`.
- Project path: `C:\Users\Administrator\.codex\social-content-studio`.
- GitHub upload remote: `https://github.com/Jacobshujun/fluxpost-studio.git`; it had no refs when checked on 2026-06-08 before the initial local snapshot upload.
- Goal confirmed from README and code: local social media content production workspace covering TikHub harvesting, local image material scanning, GPT text draft generation, GPT image generation boundary, review edits, and Feishu CLI payload publishing.

## User Roles

- Default workspace access is small-team whitelist mode for up to a few local operators. Configure it with `WORKSPACE_AUTH_MODE=whitelist`, `WORKSPACE_ALLOWED_USERS`, `WORKSPACE_ADMIN_USERS`, and `WORKSPACE_ACCESS_PASSWORD`.
- `WORKSPACE_ALLOWED_USERS` is the allow-list for account usernames. `WORKSPACE_ADMIN_USERS` is a subset of allowed usernames that may bootstrap or always receive the admin role in whitelist mode; existing admins can also assign admin role from the account menu.
- `WORKSPACE_ACCESS_PASSWORD` is only the first-admin setup key in whitelist mode. Daily sign-in uses the per-user password hash stored in `workspace_accounts`.
- Normal members can access only records stamped with their `ownerUserId`; admins can access all workspace records. Unowned legacy records are effectively admin-only because member filters require an owner match.
- Mutating workspace API routes require a signed-in workspace account before local writes, queue creation, or external provider calls. Read-only local diagnostics remain available without a browser session where explicitly supported.


## Main Flow

1. Configure environment values in `.env.local` from the README Environment section.
2. Start the local web app.
3. Search/crawl content by platform and keyword through `/api/crawl/jobs`, batch-import supported source links into the content pool through `/api/crawl/links`, or use `/api/simple/runs` for one-click simple production from keywords, exact source links, Feishu task numbers, or one viral source link.
4. Assess harvested items with the crawl-stage content safety gate, then persist retained items into the runtime database-backed content pool.
5. Optionally scan local image material folders through `/api/materials/scan`.
6. Generate post drafts through `/api/generate` or through the simple-run one-click workflow, including text and optional image generation.
7. Review or edit drafts through `/api/review`.
8. Publish approved posts through `/api/publish/feishu` or through the simple-run publish stage, which writes a local payload and calls Feishu CLI when target Base config is available.

## Tech Stack And Startup

- Framework: Next.js 16.2.6 App Router.
- UI/runtime: React 19.2.4, TypeScript, Tailwind/PostCSS, `lucide-react`.
- Database driver: `pg` is installed for optional PostgreSQL runtime storage.
- Package manager: npm, confirmed by `package-lock.json`.
- Scripts from `package.json`:
  - `npm run dev`: Next development server.
  - `npm run dev:lan`: Next development server on `0.0.0.0:3001` with hot reload for LAN testing.
  - `npm run build`: Next production build.
  - `npm run start`: Next production server.
  - `npm run start:lan`: Next production server on `0.0.0.0:3001`.
  - `npm run local:restart`: build, stop any process on port `3001`, restart `next start` on `0.0.0.0:3001`, and run local HTTP smoke.
  - `npm run lark:tasks`: poll configured Feishu/Lark chats through `lark-cli` and submit explicit task commands to the local app.
  - `npm run lark:events`: consume real-time Feishu/Lark `im.message.receive_v1` events through `lark-cli event consume` and submit explicit task commands to the local app.
  - `npm run db:diagnose`: run read-only local PostgreSQL diagnostics through `FLUXPOST_DIAG_DATABASE_URL`, showing queue state, recent logs, active sessions, lock blockers, and key PostgreSQL settings without printing the connection string.
  - `npm run db:migrate:postgres`: copy current SQLite runtime rows into a PostgreSQL database configured by `DATABASE_URL`.
  - `npm run lint`: ESLint.
- Local setup confirmed by README:
  - `npm install`
  - create `.env.local` from the README Environment section
  - `npm run dev`
  - open `http://localhost:3000`

## Page, API, CLI Entrypoints

- Main page: `src/app/page.tsx`.
- Root layout: `src/app/layout.tsx`.
- API routes:
  - `GET|POST /api/accounts`
  - `GET|POST|DELETE /api/accounts/session`
  - `GET /api/config`
  - `GET /api/content-pool`
  - `GET|POST|PATCH|DELETE /api/content/items`
  - `GET|POST /api/crawl/jobs`
  - `POST /api/crawl/links`
  - `POST /api/distribution-check`
  - `POST /api/generate`
  - `POST /api/images`
  - `POST /api/lark/tasks`
  - `GET|POST|PATCH|DELETE /api/materials/library`
  - `POST /api/materials/scan`
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
- Legacy JSON files under `data/` can be used as one-time migration sources: `content-pool.json`, `batch-production.json`, `generated-posts.json`, `material-library.json`, and `execution-log.json`.
- Runtime database stores workspace accounts/sessions, content projects, generated posts, batch jobs, material folders/assets, execution logs, crawl jobs, runtime posts, simple runs, and workspace settings metadata, including saved production prompts and the `/distribution-check` audit prompt.
- Runtime database also stores `simple_run_queue`, the durable queue table for simple-mode run execution; `image_generation_queue`, the local image job observability table for ComfyUI Klein; `feishu_publish_queue`, the durable queue table for asynchronous Feishu CLI writes; and `distribution_check_jobs`, the durable queue/progress table for large Feishu distribution audits.
- Workspace sessions use an HttpOnly `fluxpost_session` browser cookie. In default whitelist mode, the first-admin setup key is environment-driven and not stored in the runtime database; daily account passwords are stored only as Node `scrypt` hashes.
- SQLite-to-PostgreSQL migration script: `scripts/db/migrate-sqlite-to-postgres.mjs`. It copies metadata and JSON payload rows; it does not move media binaries.
- Feishu outbox payload directory from code/README: `data/feishu-outbox/`.
- Feishu/Lark IM task-launch idempotency rows live in `lark_task_launches` and are keyed by unique `message_id`.
- Generated AI images: `public/generated/`.
- Crawled media cache and video frames: `public/media/crawl/`.
- Local material scanning accepts image extensions only: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`.
- Video frame extraction uses the system `ffmpeg` executable through `src/lib/media-cache.ts`.
- Video transcription receives the cached local video path from `src/lib/media-cache.ts` only when a crawl/import/simple-run task passes `enableVideoTranscription === true`; when the switch is enabled and `ARK_API_KEY` or the existing `VOLCENGINE_ASR_APP_KEY` alias is configured, `src/lib/video-transcription.ts` extracts MP3 audio with `ffmpeg`, uploads the MP3 to Ark `/files` with `purpose=user_data`, calls Ark `/responses` with `input_audio.file_id`, and merges successful transcript text into `NormalizedSourceItem.contentText` before rewrite.
- Sensitive config is environment-based and must stay out of Harness docs: `.env.local`, `.env*`, API keys, Feishu tokens, and local user material paths when private.

## External Integrations

- 2026-06-12 ComfyUI routing update: `COMFYUI_KLEIN_ENABLED=false` is the default, so car-exterior/`杞﹀瀷缇庡浘`/people-with-car selected image tasks use the GPT-Image-2/OpenAI Images API path. Only `COMFYUI_KLEIN_ENABLED=true` plus either `COMFYUI_KLEIN_WORKFLOW_API_JSON`/`COMFYUI_KLEIN_WORKFLOW_JSON` or `COMFYUI_KLEIN_WORKFLOW_PATH` routes those strategies to the serialized local ComfyUI lane.

- TikHub API base URL/key are configured by `TIKHUB_BASE_URL` and `TIKHUB_API_KEY`.
- Video transcription is task-level opt-in: advanced keyword crawl, advanced source-link import, and simple keyword/link/Feishu runs pass `enableVideoTranscription === true` only when the operator enables the UI switch. Default-off tasks still download videos and extract frames without invoking Ark transcription.
- Ark video transcription is configured by `ARK_API_KEY`, optional `ARK_BASE_URL`, `ARK_VIDEO_TRANSCRIPTION_MODEL`, `ARK_VIDEO_TRANSCRIPTION_PROMPT`, `ARK_VIDEO_TRANSCRIPTION_AUDIO_EXTRACT_TIMEOUT_MS`, `ARK_VIDEO_TRANSCRIPTION_UPLOAD_TIMEOUT_MS`, `ARK_VIDEO_TRANSCRIPTION_TIMEOUT_MS`, and `ARK_VIDEO_TRANSCRIPTION_MAX_AUDIO_BYTES`; the existing `VOLCENGINE_ASR_APP_KEY` name remains accepted as a compatibility alias for the key. The model defaults to `doubao-seed-2-0-lite-260428`, audio extraction timeout defaults to 120s, upload timeout defaults to 300s, Responses timeout defaults to 120s, and the default prompt is `请识别音频中的内容，以文字形式返回识别结果。`. Default baseline checks verify wiring only and do not call the live Ark service.
- Workspace whitelist access is configured by `WORKSPACE_AUTH_MODE=whitelist`, `WORKSPACE_ALLOWED_USERS`, `WORKSPACE_ADMIN_USERS`, and `WORKSPACE_ACCESS_PASSWORD`; do not record the real allowed user list, admin list, setup key, or account passwords in Harness docs.
- PostgreSQL runtime storage is configured by `DATABASE_URL` and optional `DATABASE_POOL_MAX`.
- Local PostgreSQL facts confirmed on 2026-06-04: Windows service `postgresql-x64-18` is running, the client binaries live under `D:\Program Files\PostgreSQL\18\bin`, and a dedicated FluxPost Studio database/user were provisioned for the app.
- Local read-only PostgreSQL diagnostics are configured through dedicated role `fluxpost_reader` and Windows user environment variable `FLUXPOST_DIAG_DATABASE_URL`. The secret diagnostic URL must not be copied into Harness docs. The role can read app runtime tables, safe account/session views under `diagnostics`, and PostgreSQL stats/settings for session and lock inspection.
- OpenAI-compatible text endpoints are configured by `OPENAI_*` variables.
- GPT-Image-2 image generation uses the OpenAI Images API shape. `OPENAI_IMAGE_BASE_URL` configures the primary image API base URL, `OPENAI_IMAGE_API_KEY` configures the primary image API key with `OPENAI_API_KEY` fallback, optional `OPENAI_IMAGE_BACKUP_BASE_URL` and `OPENAI_IMAGE_BACKUP_API_KEY` configure a backup image route, `OPENAI_IMAGE_ENDPOINT=images` selects Images API dispatch, and `OPENAI_IMAGE_MODEL` defaults to `gpt-image-2`. Text-to-image requests use `/images/generations`; reference-image editing/image-to-image requests use multipart `/images/edits`.
- Local ComfyUI Klein image processing is configured by `COMFYUI_BASE_URL`, `COMFYUI_KLEIN_WORKFLOW_PATH`, Klein node id env values, KSampler override env values, `COMFYUI_KLEIN_TIMEOUT_MS`, `COMFYUI_KLEIN_POLL_INTERVAL_MS`, and `COMFYUI_KLEIN_FAILURE_POLICY`. It is currently used for car-exterior source-image strategy tasks, including `车型美图`, and people-with-car source-image strategy tasks; it is serialized through `WORKER_LOCAL_IMAGE_CONCURRENCY=1`.
- Feishu CLI publishing is configured by `FEISHU_CLI_BIN`, optional `FEISHU_CLI_BITABLE_ARGS`, `FEISHU_BITABLE_APP_TOKEN`, `FEISHU_BITABLE_TABLE_ID`, and optional `FEISHU_BITABLE_FIELD_MAP`.
- Generated-post Feishu CLI publishing defaults to Base fields `动态标题`, `动态正文`, `动态素材`, `内容标签`, `内容创作来源`, and single-select `车型`; the content creation source value comes from the workspace owner display name on the generated post, with owner id as a historical fallback, and `车型` comes from the simple task keyword or imported Feishu vehicle value.
- Feishu task-number content import is configured by optional `FEISHU_CONTENT_IMPORT_BASE_TOKEN`, `FEISHU_CONTENT_IMPORT_TABLE_ID`, and `FEISHU_CONTENT_IMPORT_FIELD_MAP`; base token and table id default to the generated-post publish Base/table when omitted. The default read fields are `任务编号`, `动态标题`, `动态正文`, `动态素材`, and `车型`. Imported `车型` values become the content-pool keyword/project for the source items.
- Feishu distribution audit is configured by optional `FEISHU_DISTRIBUTION_CHECK_BASE_TOKEN`, `FEISHU_DISTRIBUTION_CHECK_TABLE_ID`, `FEISHU_DISTRIBUTION_CHECK_VIEW_ID`, and `FEISHU_DISTRIBUTION_CHECK_FIELD_MAP`. The default target is Base `JbpPbSIMqaD75wsZ9fAcBy9mnEe`, table `tblA0EfoAF9J4ffi`, view `vewE44G31p`; it reads `编号`, `动态标题`, `动态正文`, `动态素材`, `车型`, and writes single-select `是否分发` plus numeric `内容评分`. Operators can customize the audit prompt from `/distribution-check`; the saved prompt is stored in workspace settings as `distributionCheckPrompt`. The page enqueues durable audit jobs and polls progress instead of waiting for one long request.
- Optional Feishu IM success notification is configured by exactly one of `FEISHU_NOTIFY_CHAT_ID` or `FEISHU_NOTIFY_USER_ID`; it uses bot identity through `lark-cli im +messages-send`.
- V1/V2 Feishu/Lark conversation task launch is configured by `LARK_TASK_CHAT_IDS`, `LARK_TASK_USER_MAP`, `LARK_TASK_API_TOKEN`, `LARK_TASK_DEFAULT_PLATFORMS`, `LARK_TASK_DEFAULT_COUNT`, and `LARK_TASK_CONFIRM_ABOVE`. The local polling runner reads configured chats through bot identity, while the real-time event runner consumes `im.message.receive_v1` events; both post explicit commands to local `/api/lark/tasks`. Sender open ids must map to existing workspace account ids before a simple run is enqueued.
- The confirmed default Feishu command shape is `lark-cli base +record-batch-create --as bot --base-token {appToken} --table-id {tableId} --json @{recordPayload}`.
- Simple-mode throughput knobs include `SIMPLE_RUN_MAX_ITEMS` (fallback `500`, hard ceiling `2000`) and `SIMPLE_RUN_WORKER_CONCURRENCY` (fallback `4`, hard ceiling `10`).
- Feishu publish queue throughput is controlled by `FEISHU_PUBLISH_WORKER_CONCURRENCY` (fallback `1`, hard ceiling `5`), with a per-owner running-job guard so Feishu CLI writes are serialized per user/owner.
- Feishu attachment-upload throughput is controlled separately by `WORKER_FEISHU_ATTACHMENT_CONCURRENCY` (fallback `3`, hard ceiling `10`) so large attachment batches do not use the same high concurrency as record creation.
- Distribution audit throughput is isolated from content collection and generation: `DISTRIBUTION_CHECK_WORKER_CONCURRENCY` defaults to `1` and caps at `3`; per-job work uses dedicated pools `WORKER_DISTRIBUTION_RECORD_CONCURRENCY` fallback `8` cap `20`, `WORKER_DISTRIBUTION_GPT_CONCURRENCY` fallback `6` cap `15`, `WORKER_DISTRIBUTION_FEISHU_READ_CONCURRENCY` fallback `8` cap `20`, and `WORKER_DISTRIBUTION_FEISHU_WRITE_CONCURRENCY` fallback `2` cap `5`.

## Deployment Facts

- Confirmed local dev entry: `npm run dev`.
- Confirmed production entry: `npm run build` followed by `npm run start`.
- Confirmed local LAN production refresh entry: `npm run local:restart`.
- `next.config.ts` sets Turbopack root to `process.cwd()`.
- Server IP, domain, reverse proxy, process manager, and production deployment target: 待确认.

## Not Covered Or Pending Confirmation

- Formal user roles beyond V1 `admin`/`operator`: 待确认.
- Server deployment runbook: 待确认.
- Generated-post Feishu target Base token and table ID for deployment: 待确认. Source-link import sync has a user-requested default target in `src/lib/config.ts`.
- Safe isolated test credentials for TikHub/OpenAI/Feishu: 待确认.
- PostgreSQL server installation, database/user provisioning, and live migration execution: confirmed locally on 2026-06-04.
- High-volume asynchronous queue schema/worker model beyond the current JSONB-backed runtime tables: 待确认.
- Whether root `.tmp-*.json` files should be deleted: 待确认; they are treated as local debug artifacts, not Harness context.
