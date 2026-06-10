# Project Brief

Last updated: 2026-06-09

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
3. Search/crawl content by platform and keyword through `/api/crawl/jobs`, batch-import supported source links into the content pool through `/api/crawl/links`, or use `/api/simple/runs` for one-click simple production from either keywords or exact source links.
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
  - `POST /api/generate`
  - `POST /api/images`
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

- Supported platform enum in code: `wechat_channels`, `xiaohongshu`, `douyin`, `weibo`.
- Local runtime database in this workspace: PostgreSQL on `127.0.0.1:5432` through `DATABASE_URL` in `.env.local`; do not expose the connection string.
- Fallback runtime database when `DATABASE_URL` is not configured: `data/fluxpost.db` SQLite.
- PostgreSQL schema: `db/migrations/001_initial_postgres.sql`.
- Legacy JSON files under `data/` can be used as one-time migration sources: `content-pool.json`, `batch-production.json`, `generated-posts.json`, `material-library.json`, and `execution-log.json`.
- Runtime database stores workspace accounts/sessions, content projects, generated posts, batch jobs, material folders/assets, execution logs, crawl jobs, runtime posts, simple runs, and workspace settings metadata.
- Runtime database also stores `simple_run_queue`, the durable queue table for simple-mode run execution, and `feishu_publish_queue`, the durable queue table for asynchronous Feishu CLI writes.
- Workspace sessions use an HttpOnly `fluxpost_session` browser cookie. In default whitelist mode, the first-admin setup key is environment-driven and not stored in the runtime database; daily account passwords are stored only as Node `scrypt` hashes.
- SQLite-to-PostgreSQL migration script: `scripts/db/migrate-sqlite-to-postgres.mjs`. It copies metadata and JSON payload rows; it does not move media binaries.
- Feishu outbox payload directory from code/README: `data/feishu-outbox/`.
- Generated AI images: `public/generated/`.
- Crawled media cache and video frames: `public/media/crawl/`.
- Local material scanning accepts image extensions only: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`.
- Video frame extraction uses the system `ffmpeg` executable through `src/lib/media-cache.ts`.
- Sensitive config is environment-based and must stay out of Harness docs: `.env.local`, `.env*`, API keys, Feishu tokens, and local user material paths when private.

## External Integrations

- TikHub API base URL/key are configured by `TIKHUB_BASE_URL` and `TIKHUB_API_KEY`.
- Workspace whitelist access is configured by `WORKSPACE_AUTH_MODE=whitelist`, `WORKSPACE_ALLOWED_USERS`, `WORKSPACE_ADMIN_USERS`, and `WORKSPACE_ACCESS_PASSWORD`; do not record the real allowed user list, admin list, setup key, or account passwords in Harness docs.
- PostgreSQL runtime storage is configured by `DATABASE_URL` and optional `DATABASE_POOL_MAX`.
- Local PostgreSQL facts confirmed on 2026-06-04: Windows service `postgresql-x64-18` is running, the client binaries live under `D:\Program Files\PostgreSQL\18\bin`, and a dedicated FluxPost Studio database/user were provisioned for the app.
- OpenAI-compatible text endpoints are configured by `OPENAI_*` variables.
- GPT-Image-2 image generation uses the OpenAI Images API shape. `OPENAI_IMAGE_BASE_URL` configures the primary image API base URL, `OPENAI_IMAGE_API_KEY` configures the primary image API key with `OPENAI_API_KEY` fallback, optional `OPENAI_IMAGE_BACKUP_BASE_URL` and `OPENAI_IMAGE_BACKUP_API_KEY` configure a backup image route, `OPENAI_IMAGE_ENDPOINT=images` selects Images API dispatch, and `OPENAI_IMAGE_MODEL` defaults to `gpt-image-2`. Text-to-image requests use `/images/generations`; reference-image editing/image-to-image requests use multipart `/images/edits`.
- Feishu CLI publishing is configured by `FEISHU_CLI_BIN`, optional `FEISHU_CLI_BITABLE_ARGS`, `FEISHU_BITABLE_APP_TOKEN`, `FEISHU_BITABLE_TABLE_ID`, and optional `FEISHU_BITABLE_FIELD_MAP`.
- Generated-post Feishu CLI publishing defaults to Base fields `动态标题`, `动态正文`, `动态素材`, `内容标签`, and `内容创作来源`; the content creation source value comes from the workspace owner display name on the generated post, with owner id as a historical fallback.
- Feishu source-link import sync is configured by `FEISHU_SOURCE_IMPORT_ENABLED`, `FEISHU_SOURCE_IMPORT_BASE_TOKEN`, `FEISHU_SOURCE_IMPORT_TABLE_ID`, and optional `FEISHU_SOURCE_IMPORT_FIELD_MAP`. The default source-import target is the user-requested Base `JbpPbSIMqaD75wsZ9fAcBy9mnEe` table `tbllsn3LBZ6mWTyL`; it writes `源链接`, `标题`, `正文`, single-select `平台`, and attachment fields `图片`/`视频` only for TikHub-resolved items kept by the source safety filter.
- Optional Feishu IM success notification is configured by exactly one of `FEISHU_NOTIFY_CHAT_ID` or `FEISHU_NOTIFY_USER_ID`; it uses bot identity through `lark-cli im +messages-send`.
- The confirmed default Feishu command shape is `lark-cli base +record-batch-create --as bot --base-token {appToken} --table-id {tableId} --json @{recordPayload}`.
- Simple-mode throughput knobs include `SIMPLE_RUN_MAX_ITEMS` (fallback `500`, hard ceiling `2000`) and `SIMPLE_RUN_WORKER_CONCURRENCY` (fallback `4`, hard ceiling `10`).
- Feishu publish queue throughput is controlled by `FEISHU_PUBLISH_WORKER_CONCURRENCY` (fallback `1`, hard ceiling `5`), with a per-owner running-job guard so Feishu CLI writes are serialized per user/owner.
- Feishu attachment-upload throughput is controlled separately by `WORKER_FEISHU_ATTACHMENT_CONCURRENCY` (fallback `3`, hard ceiling `10`) so large attachment batches do not use the same high concurrency as record creation.

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
