# Project Brief

Last updated: 2026-06-08

## Project Name, Goal, Path

- Project name: FluxPost Studio.
- Package name: `social-content-studio`.
- Project path: `C:\Users\Administrator\.codex\social-content-studio`.
- GitHub upload remote: `https://github.com/Jacobshujun/fluxpost-studio.git`; it had no refs when checked on 2026-06-08 before the initial local snapshot upload.
- Goal confirmed from README and code: local social media content production workspace covering TikHub harvesting, local image material scanning, GPT text draft generation, GPT image generation boundary, review edits, and Feishu CLI payload publishing.

## User Roles

- 待确认: the repository does not define formal user roles.
- Confirmed product surface implies operators who harvest social content, create/review posts, and publish approved payloads to Feishu.

## Main Flow

1. Configure environment values in `.env.local` from the README Environment section.
2. Start the local web app.
3. Search/crawl content by platform and keyword through `/api/crawl/jobs`.
4. Assess harvested items with the crawl-stage content safety gate, then persist retained items into the runtime database-backed content pool.
5. Optionally scan local image material folders through `/api/materials/scan`.
6. Generate post drafts through `/api/generate`, including text and optional image generation.
7. Review or edit drafts through `/api/review`.
8. Publish approved posts through `/api/publish/feishu`, which writes a local payload and calls Feishu CLI when target Base config is available.

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
  - `GET /api/config`
  - `GET /api/content-pool`
  - `GET|POST|PATCH|DELETE /api/content/items`
  - `GET|POST /api/crawl/jobs`
  - `POST /api/generate`
  - `POST /api/images`
  - `GET|POST|PATCH|DELETE /api/materials/library`
  - `POST /api/materials/scan`
  - `GET|POST /api/production/batches`
  - `GET|POST|PATCH|DELETE /api/production/posts`
  - `POST /api/production/posts/regenerate`
  - `POST /api/publish/feishu`
  - `POST /api/review`
  - `GET|DELETE /api/activity`
- Feishu CLI wrapper: `src/lib/feishu-cli.ts`.

## Product And Data Rules

- Supported platform enum in code: `wechat_channels`, `xiaohongshu`, `douyin`, `weibo`.
- Local runtime database in this workspace: PostgreSQL on `127.0.0.1:5432` through `DATABASE_URL` in `.env.local`; do not expose the connection string.
- Fallback runtime database when `DATABASE_URL` is not configured: `data/fluxpost.db` SQLite.
- PostgreSQL schema: `db/migrations/001_initial_postgres.sql`.
- Legacy JSON files under `data/` can be used as one-time migration sources: `content-pool.json`, `batch-production.json`, `generated-posts.json`, `material-library.json`, and `execution-log.json`.
- Runtime database stores content projects, generated posts, batch jobs, material folders/assets, execution logs, crawl jobs, runtime posts, simple runs, and workspace settings metadata.
- Runtime database also stores `simple_run_queue`, the durable queue table for simple-mode run execution.
- SQLite-to-PostgreSQL migration script: `scripts/db/migrate-sqlite-to-postgres.mjs`. It copies metadata and JSON payload rows; it does not move media binaries.
- Feishu outbox payload directory from code/README: `data/feishu-outbox/`.
- Generated AI images: `public/generated/`.
- Crawled media cache and video frames: `public/media/crawl/`.
- Local material scanning accepts image extensions only: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`.
- Video frame extraction uses the system `ffmpeg` executable through `src/lib/media-cache.ts`.
- Sensitive config is environment-based and must stay out of Harness docs: `.env.local`, `.env*`, API keys, Feishu tokens, and local user material paths when private.

## External Integrations

- TikHub API base URL/key are configured by `TIKHUB_BASE_URL` and `TIKHUB_API_KEY`.
- PostgreSQL runtime storage is configured by `DATABASE_URL` and optional `DATABASE_POOL_MAX`.
- Local PostgreSQL facts confirmed on 2026-06-04: Windows service `postgresql-x64-18` is running, the client binaries live under `D:\Program Files\PostgreSQL\18\bin`, and a dedicated FluxPost Studio database/user were provisioned for the app.
- OpenAI-compatible text and image endpoints are configured by `OPENAI_*` variables.
- RunningHub image generation is configured by `OPENAI_IMAGE_ENDPOINT=runninghub` plus `RUNNINGHUB_*` variables. The RunningHub API key is sensitive and must stay in local env only.
- Feishu CLI publishing is configured by `FEISHU_CLI_BIN`, optional `FEISHU_CLI_BITABLE_ARGS`, `FEISHU_BITABLE_APP_TOKEN`, `FEISHU_BITABLE_TABLE_ID`, and optional `FEISHU_BITABLE_FIELD_MAP`.
- Optional Feishu IM success notification is configured by exactly one of `FEISHU_NOTIFY_CHAT_ID` or `FEISHU_NOTIFY_USER_ID`; it uses bot identity through `lark-cli im +messages-send`.
- The confirmed default Feishu command shape is `lark-cli base +record-batch-create --as bot --base-token {appToken} --table-id {tableId} --json @{recordPayload}`.
- Simple-mode throughput knobs include `SIMPLE_RUN_MAX_ITEMS` (fallback `500`, hard ceiling `2000`) and `SIMPLE_RUN_WORKER_CONCURRENCY` (fallback `2`, hard ceiling `10`).
- Feishu attachment-upload throughput is controlled separately by `WORKER_FEISHU_ATTACHMENT_CONCURRENCY` (fallback `3`, hard ceiling `10`) so large attachment batches do not use the same high concurrency as record creation.

## Deployment Facts

- Confirmed local dev entry: `npm run dev`.
- Confirmed production entry: `npm run build` followed by `npm run start`.
- Confirmed local LAN production refresh entry: `npm run local:restart`.
- `next.config.ts` sets Turbopack root to `process.cwd()`.
- Server IP, domain, reverse proxy, process manager, and production deployment target: 待确认.

## Not Covered Or Pending Confirmation

- Formal user roles and permissions: 待确认.
- Server deployment runbook: 待确认.
- Feishu target Base token and table ID: 待确认.
- Safe isolated test credentials for TikHub/OpenAI/Feishu: 待确认.
- PostgreSQL server installation, database/user provisioning, and live migration execution: confirmed locally on 2026-06-04.
- High-volume asynchronous queue schema/worker model beyond the current JSONB-backed runtime tables: 待确认.
- Whether root `.tmp-*.json` files should be deleted: 待确认; they are treated as local debug artifacts, not Harness context.
