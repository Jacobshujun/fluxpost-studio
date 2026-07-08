# Architecture Rules

Last updated: 2026-06-24

## Module Boundaries

- Main workspace UI stays under `src/app/page.tsx`, standalone content harvesting/pool operations live under `src/app/content/page.tsx`, and shared styling stays under `src/app/globals.css` unless a task explicitly scopes another component split.
- API routes under `src/app/api/**/route.ts` should stay thin and delegate domain work to `src/lib/*`.
- Platform crawling belongs in `src/lib/tikhub.ts`.
- Source link batch-import orchestration belongs in `src/lib/source-link-import.ts`; the API route should stay thin and delegate to that helper. Reusable source-link resolution for simple-run link mode also belongs in this module. TikHub platform detail/share endpoint construction and response normalization for source links still belong in `src/lib/tikhub.ts`.
- Source-link-only local importers belong in their own `src/lib/*` modules and should be dispatched from `src/lib/source-link-import.ts`. Dongchedi article parsing belongs in `src/lib/dongchedi.ts`; it should canonicalize `/ugc/article/{id}` inputs, normalize embedded article data as `platform="dongchedi"`, and fail clearly on anti-bot challenge HTML.
- Feishu task-number content import belongs in `src/lib/feishu-content-import.ts`. It should read configured Base records by `任务编号`, download `动态素材` attachments through the Base attachment download command, normalize imported records as `NormalizedSourceItem` with `platform="feishu"`, and leave generated-post publishing to the existing Feishu publish path.
- Feishu distribution audit belongs in `src/lib/distribution-check.ts`. The API route `src/app/api/distribution-check/route.ts` should stay thin, require workspace auth, and delegate to the helper. The helper should enqueue durable jobs for large batches, run background workers with dedicated distribution concurrency pools, use `lark-cli base +field-list`, `+record-search` or `+record-get`, and grouped `+record-batch-update`, writing `是否分发` and `内容评分` only.
- Content pool persistence belongs in `src/lib/content-pool.ts`.
- Batch production persistence belongs in `src/lib/batch-production.ts`.
- Generated post persistence belongs in `src/lib/generated-posts.ts`.
- Material library persistence belongs in `src/lib/material-library.ts`.
- Execution logs belong in `src/lib/activity-log.ts`.
- Normal execution-log appends use the row-level append helper in `src/lib/database.ts`; regular log writes must not read and rewrite the whole execution-log table.
- Runtime storage backend selection, SQLite/PostgreSQL connection setup, schema setup, legacy JSON migration, and persistence helpers belong in `src/lib/database.ts`.
- Workspace account/session persistence schema belongs in `src/lib/database.ts` and `db/migrations/001_initial_postgres.sql`; whitelist auth parsing, admin username parsing, account-table creation/password hashing, session lookup, and request auth helpers belong in `src/lib/workspace-accounts.ts`.
- Workspace owner-scope helpers belong in `src/lib/workspace-ownership.ts`. Domain stores should use those helpers instead of duplicating admin/member owner checks.
- Durable simple-run queue schema, enqueue/claim/heartbeat helpers, and PostgreSQL `FOR UPDATE SKIP LOCKED` queue claiming belong in `src/lib/database.ts`; simple-run worker orchestration belongs in `src/lib/simple-runs.ts`.
- Durable Feishu publish queue schema, save/list/claim/heartbeat helpers, and PostgreSQL `FOR UPDATE SKIP LOCKED` queue claiming belong in `src/lib/database.ts`; Feishu publish queue orchestration belongs in `src/lib/feishu-publish-queue.ts`.
- Durable distribution-check job schema, save/list/claim/heartbeat helpers, and PostgreSQL `FOR UPDATE SKIP LOCKED` queue claiming belong in `src/lib/database.ts`; distribution-check worker orchestration belongs in `src/lib/distribution-check.ts`.
- Application-level concurrency limits and shared provider pools belong in `src/lib/concurrency.ts`.
- PostgreSQL schema files belong in `db/migrations/`; SQLite-to-PostgreSQL copy scripts belong in `scripts/db/`.
- Text generation belongs in `src/lib/openai.ts`.
- Image generation belongs in `src/lib/image-generation.ts`.
- OpenAI-compatible Images API support belongs in `src/lib/image-generation.ts`, including local/remote reference-image normalization, multipart `/images/edits` upload, JSON `/images/generations` requests, and image-provider retry/fallback behavior.
- Review-desk manual image replacement/addition belongs in `src/lib/review-image-upload.ts` plus the thin authenticated route `src/app/api/review/images/route.ts`: the route must require workspace auth, validate `postId` and `imageIndex` against an owner-accessible generated post, accept `mode=append` only for the current end-of-list image index, delegate file byte sniffing/persistence to the helper, and return a `/generated/review-uploads/...` URL for later persistence through `/api/review`.
- Local ComfyUI Klein workflow integration belongs in `src/lib/comfyui-klein.ts`; `src/lib/image-generation.ts` should only dispatch provider-marked selected image tasks to it and keep generic image-provider logic separate.
- The ComfyUI Klein routing decision belongs at task construction time through an explicit option derived from `COMFYUI_KLEIN_ENABLED` plus workflow configuration. Client code may use `/api/config` non-sensitive status, but shared frontend-safe task builders must not read server env directly.
- Feishu CLI integration belongs in `src/lib/feishu-cli.ts`.
- Feishu/Lark IM task command parsing, sender-to-owner validation, message idempotency, and simple-run launch orchestration belong in `src/lib/lark-task-launcher.ts`. The API route `src/app/api/lark/tasks/route.ts` should stay thin: bearer-token auth, request validation, and delegation to the launcher. The polling CLI belongs in `scripts/lark-task-runner.mjs`; the real-time event consumer belongs in `scripts/lark-task-events.mjs`.
- Crawled media and keyframe extraction belong in `src/lib/media-cache.ts`.
- Historical crawled-media backfill belongs in `src/lib/media-backfill.ts`; keep it server-side and route it through existing content-pool batch APIs.
- Video highlight-frame selection, the 5-frame cap, visual similarity filtering, and stale frame URL cleanup belong in `src/lib/video-frame-policy.ts`; cache, backfill, content-pool, tagging, production controls, and frontend preview paths should use the shared policy instead of local slice limits.
- Crawled media local/remote coverage summaries belong in `src/lib/media-cache-status.ts`; frontend display may derive the same shape as a fallback for older records.
- Crawled image URL filtering and downloaded/remote image alignment belong in `src/lib/media-url-filter.ts`.
- Image byte-format sniffing belongs in `src/lib/image-format.ts`; media cache, local media serving, and source visual tagging should share it instead of duplicating file-header checks.
- Lightweight Douyin image/text carousel URL extraction belongs in `src/lib/douyin-media.ts`; use it from TikHub normalization and content-pool raw repair instead of broad recursive URL fallback for Douyin image posts.
- Shared remote media request headers belong in `src/lib/media-request.ts`; browser preview proxying belongs in `src/app/api/media/proxy/route.ts`.
- Runtime local media serving belongs in `src/app/api/media/local/[...path]/route.ts`, with browser-stable rewrites configured in `next.config.ts` for `/media/crawl/:path*` and `/generated/:path*`.
- Review-desk per-image prompt regeneration should reuse `POST /api/images` with a single-image request, update only the selected `imageUrls[index]` in the local draft, and persist through the existing generated-post review save path.
- Crawl-stage content safety filtering belongs in `src/lib/source-safety.ts`; API routes and simple-run workflow should call it before source tagging and content-pool ingest instead of embedding safety prompts or local rule lists inline.
- Crawled content and visual AI tagging belongs in `src/lib/source-tagging.ts`; API routes should call it but not embed tag prompts or normalization rules.
- For video/mixed source items with extracted `videoFrames`, visual tagging must use the frames instead of preview images or covers.
- For video-like source items without extracted `videoFrames`, default production-task creation and simple automatic production must not fall back to source/downloaded/cover images; image-only sources may still use downloaded/source images.
- For video/mixed source items, backend write paths should expose at most 5 selected video highlight frames and should remove stale unselected local frame URLs from `mediaUrls`.

## Backend Rules

- Keep external API calls server-side.
- Do not expose API keys or tokens through API responses.
- TikHub, media cache, GPT, image-generation, Feishu, and production fan-out should use the shared pools from `src/lib/concurrency.ts`; do not introduce new hard-coded provider concurrency numbers in feature code.
- Local ComfyUI Klein work must use the dedicated `localImage` pool from `src/lib/concurrency.ts`. Keep it separate from the high-throughput `image` pool because the current local workflow cannot run more than one image at a time.
- `src/lib/image-generation.ts` must treat stale/historical `provider="comfyui_klein"` tasks as normal OpenAI Images tasks when `isComfyUiKleinConfigured()` is false, so turning `COMFYUI_KLEIN_ENABLED` off actually restores GPT-Image-2 behavior.
- Simple-mode API routes should enqueue work and return run state; long-running simple workflow execution belongs in the simple-run worker path, not in the API route handler.
- Simple-mode publish preparation should serialize local approved-post persistence before enqueueing the Feishu publish job. Feishu queue local generated-post persistence must also stay serialized before durable queue creation and after Feishu publish completion; do not fan out `persistOnePost` with `Promise.all`. Feishu CLI work remains asynchronous in `src/lib/feishu-publish-queue.ts`.
- Feishu publish API routes should enqueue work and expose read-only job polling; long-running Feishu CLI execution belongs in the Feishu publish queue worker, not in the API route handler or simple-run worker.
- Feishu publish queue code must keep queue ownership separate from generated-post ownership. Manual publish should use the current account as the queue owner, but enqueueing must not rewrite `GeneratedPost.ownerUserId`/`ownerDisplayName` to the queue owner; admins can publish visible posts without taking ownership of those posts.
- All workspace content APIs, including reads, should use `requireWorkspaceAccount(...)` and pass the current account into domain store calls so normal members see only their own owner-scoped records while admins see all records.
- All mutating workspace API routes should use `requireWorkspaceAccount(...)` before local writes, queue creation, or external provider calls, and carry the account id into record/queue ownership where relevant. Do not duplicate whitelist parsing, password checking, cookie parsing, or session-token hashing in API routes.
- The Feishu/Lark IM task route is the narrow exception to browser-cookie workspace auth because it is a local CLI ingress. It must require `LARK_TASK_API_TOKEN`, enforce `LARK_TASK_CHAT_IDS`, map sender ids through `LARK_TASK_USER_MAP` to existing active workspace accounts, persist `lark_task_launches` idempotency before/after launch, and enqueue through `startSimpleRun(...)`. Do not let IM messages call provider workflows directly.
- Do not wrap a task in the same pool that its nested HTTP request also needs, because that can deadlock when the outer fan-out fills the pool. Platform fan-out can be locally bounded while each TikHub HTTP request acquires the crawl pool.
- Do not add broad catch-and-ignore behavior around external calls. Return or record actionable errors.
- Crawl request parameters belong before provider calls. Do not add post-crawl local keyword relevance filters, Xiaohongshu image/video post-filters, all-type fallback searches, or cross-platform result drops in the ingest path; after crawling, only dedupe, slice, cache media, content safety assessment/filtering, tag, and persist. Content safety filtering is limited to profanity, insult, strong negative sentiment, and competitor bashing and must not become a keyword relevance filter.
- Link batch import is an exact-source ingest path, not keyword search. It should not mutate keyword crawl request mapping. Advanced `/api/crawl/links` persists imported items into the content pool, while simple-run link mode must enqueue through `/api/simple/runs`, resolve links server-side, skip keyword platform search/top-up, and then reuse the same media cache, source safety, source tagging, content-pool ingest, production, and publish boundaries as keyword simple runs.
- Dongchedi link import must stay source-link/ID-only unless a separate verified keyword provider is added. Do not add `dongchedi` to `CrawlPlatform` or TikHub keyword crawl controls just because it is accepted by source-link import.
- Feishu task-number simple import is a table-record ingest path, not a TikHub crawl platform. Simple-run Feishu mode must enqueue through `/api/simple/runs`, resolve records server-side through `src/lib/feishu-content-import.ts`, skip keyword platform search/top-up, then reuse source safety, source tagging, content-pool ingest, production, image generation, and Feishu publish boundaries. Imported `车型` values should determine the content-pool keyword/project; the fallback keyword is only for records without a vehicle value.
- Source-link import must not write imported source content back to a Feishu Base. Advanced `/api/crawl/links` and simple-run link mode should stop after local content-pool ingest; generated-post publishing remains the only downstream Feishu write path for imported links.
- Douyin `content_type=2` image requests are allowed a narrow media-normalization guard: keep true raw carousel/image records, skip video-cover-only records returned by the provider, and strip direct video media from kept image records so image-only crawls do not generate video frames.
- Weibo App search normalization must use a dedicated `mblog` extractor and content-image field extraction. Do not rely on generic likely-array selection or broad raw-record image fallback for Weibo, because App payloads include layout objects, avatars, and ad/icon media near the actual post records.
- Source visual tagging must preflight remote HTTP(S) image assets and sniff local app-served image bytes before model calls: use shared media request headers, validate supported JPEG/PNG/GIF/WebP content, convert valid images to inline data URLs, and record per-asset skips for invalid/unsupported assets.
- Crawled image cache paths must be browser-readable before they are exposed as `downloadedImages`; HEIC bytes should be converted to JPEG in place, and unsupported cached image bytes should be surfaced as download errors instead of silent broken previews.
- Do not use production external services in default verification.

## Frontend Rules

- Keep the first screen as the usable workspace, not a landing page.
- When no workspace account session exists, the first screen may be the account initialization/login panel; after sign-in it must return directly to the usable workspace rather than a marketing or instructional page.
- Maintain responsive desktop and mobile behavior.
- Previewed crawled media should use content media, not avatars or profile images, whenever the backend can distinguish them.
- Local crawled/generated media browser URLs should stay `/media/crawl/...` or `/generated/...`; serving details should remain behind the Next rewrite and local media API.
- The local media API should sniff image bytes before extension fallback so mismatched platform cache filenames still receive the correct browser content type.
- Frontend image previews should append the shared local media preview version query to `/media/...` and `/generated/...` URLs so browser caches do not preserve repaired bad media bytes under unchanged runtime database paths.
- For video/mixed source items with extracted `videoFrames`, image preview should be the high/key frame list and should not render a separate duplicate high-frame grid.
- For video/mixed source items, frontend preview and manual visual-tag editing should use the shared 5-frame selector as a stale-record guard.
- Do not merge crawled `downloadedImages` and remote `images` by slicing remote images with `downloadedImages.length`; use `mergeDownloadedAndRemoteImages` so missing cache slots fall back to the correct remote source image.
- For visual previews and production image tasks, prefer cached local media before remote source URLs when available, while still retaining remote fallbacks for missing cache slots.
- Show local media cache coverage in the content-pool UI so operators can distinguish local images/videos/keyframes from remote fallback URLs.
- Keep `referrerPolicy="no-referrer"` on remote-capable image previews so Xiaohongshu CDN images are not requested with the local app URL as Referer.

## Data Rules

- Treat `data/fluxpost.db`, its SQLite sidecar files, and configured PostgreSQL databases as runtime state.
- Treat `data/*.json` as legacy migration/compatibility artifacts unless a task explicitly asks for JSON import/export.
- Treat `public/media/crawl` and `public/generated` as runtime media stores. Do not rely on Next production static file discovery for newly created files; use the local media API route.
- Do not write directly to runtime data from the frontend.
- Do not mutate `data/`, `public/generated/`, `public/media/`, `.tmp-*.json`, or `test-artifacts/` during Trellis-only work except through explicit verification that is documented.
- Do not reintroduce JSON file read/write stores for content pool, generated posts, batch jobs, material library, execution logs, crawl jobs, simple runs, or runtime posts.
- Runtime PostgreSQL tables should store metadata, indexed status/time fields, and JSON payloads; do not store crawled/generated media binaries in PostgreSQL.
- Workspace account passwords must remain hashed; session cookies/tokens must not be stored or exposed in plaintext outside the browser cookie value. Store only session token hashes in runtime tables.
- In whitelist auth mode, `WORKSPACE_ACCESS_PASSWORD` stays environment-driven as the first-admin setup key and is never persisted to runtime tables. Daily sign-in must use per-user account-table password hashes, and whitelist users should use stable account ids shaped as `whitelist:{username}` for local owner attribution.
- Normal-member reads must exclude unowned records. Treat historical records without `ownerUserId` as admin-visible legacy data unless the user explicitly requests a migration.
- `simple_run_queue` is a runtime coordination table. Keep external provider calls outside database transactions; claim/heartbeat/complete updates should be short row-level mutations.
- `feishu_publish_queue` is a runtime coordination table. Keep Feishu CLI calls outside database transactions; claim/heartbeat/status updates should be short row-level mutations, and queue claiming must preserve one running Feishu write per owner/user.
- `image_generation_queue` is a runtime observability table for local image jobs. Keep ComfyUI HTTP calls outside database transactions; queued/running/completed/failed state updates should be short row-level mutations.
- `lark_task_launches` is a runtime idempotency/observability table for Feishu/Lark IM task launches. It stores message, chat, sender, owner, run id, command text, status, and error metadata only; it must not store Feishu credentials or local bearer token values.
- Content-project runtime writes should use row-level upsert, not full-table replacement. Full-table replacement is unsafe for concurrent content-pool source-status updates on PostgreSQL.
- Generated-post runtime save/update/status/delete operations should use row-level upsert/delete, not full-table replacement. Full-table replacement is unsafe for concurrent generated-post status updates on PostgreSQL.

## Deployment Rules

- Confirmed entries are `npm run dev`, `npm run build`, and `npm run start`.
- For the local LAN production server on port `3001`, use `npm run local:restart` after frontend or API code changes. Do not rely on `npm run build` alone to refresh an already-running `next start` process.
- Use `npm run dev:lan` when hot reload is desired during active frontend development.
- Do not add a new deployment path, process manager, service file, or server target without updating `project_brief.md`, `decisions.md`, `verification.md`, and `handoff.md`.

## Trellis Rules

- `.trellis/` is the only active persistent AI collaboration system. `.trellis/spec/fluxpost/` is the FluxPost project-memory layer inside that system.
- `feature_list.json` is a state machine, not a loose todo list.
- A feature cannot be `done` without evidence.
- Update `progress.md` and `handoff.md` after meaningful development, debugging, deployment, or analysis.
