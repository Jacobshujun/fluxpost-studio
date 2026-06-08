# Architecture Rules

Last updated: 2026-06-05

## Module Boundaries

- UI entry stays under `src/app/page.tsx` and shared styling under `src/app/globals.css` unless a task explicitly scopes a component split.
- API routes under `src/app/api/**/route.ts` should stay thin and delegate domain work to `src/lib/*`.
- Platform crawling belongs in `src/lib/tikhub.ts`.
- Source link batch-import orchestration belongs in `src/lib/source-link-import.ts`; the API route should stay thin and delegate to that helper. Reusable source-link resolution for simple-run link mode also belongs in this module. TikHub platform detail/share endpoint construction and response normalization for source links still belong in `src/lib/tikhub.ts`.
- Content pool persistence belongs in `src/lib/content-pool.ts`.
- Batch production persistence belongs in `src/lib/batch-production.ts`.
- Generated post persistence belongs in `src/lib/generated-posts.ts`.
- Material library persistence belongs in `src/lib/material-library.ts`.
- Execution logs belong in `src/lib/activity-log.ts`.
- Runtime storage backend selection, SQLite/PostgreSQL connection setup, schema setup, legacy JSON migration, and persistence helpers belong in `src/lib/database.ts`.
- Durable simple-run queue schema, enqueue/claim/heartbeat helpers, and PostgreSQL `FOR UPDATE SKIP LOCKED` queue claiming belong in `src/lib/database.ts`; simple-run worker orchestration belongs in `src/lib/simple-runs.ts`.
- Application-level concurrency limits and shared provider pools belong in `src/lib/concurrency.ts`.
- PostgreSQL schema files belong in `db/migrations/`; SQLite-to-PostgreSQL copy scripts belong in `scripts/db/`.
- Text generation belongs in `src/lib/openai.ts`.
- Image generation belongs in `src/lib/image-generation.ts`.
- RunningHub image provider support, including local reference upload, task submission, and polling, belongs in `src/lib/image-generation.ts`.
- Feishu CLI integration belongs in `src/lib/feishu-cli.ts`.
- Crawled media and keyframe extraction belong in `src/lib/media-cache.ts`.
- Historical crawled-media backfill belongs in `src/lib/media-backfill.ts`; keep it server-side and route it through existing content-pool batch APIs.
- Video highlight-frame selection, the 5-frame cap, and stale frame URL cleanup belong in `src/lib/video-frame-policy.ts`; cache, backfill, content-pool, tagging, production controls, and frontend preview paths should use the shared policy instead of local slice limits.
- Crawled media local/remote coverage summaries belong in `src/lib/media-cache-status.ts`; frontend display may derive the same shape as a fallback for older records.
- Crawled image URL filtering and downloaded/remote image alignment belong in `src/lib/media-url-filter.ts`.
- Image byte-format sniffing belongs in `src/lib/image-format.ts`; media cache, local media serving, and source visual tagging should share it instead of duplicating file-header checks.
- Lightweight Douyin image/text carousel URL extraction belongs in `src/lib/douyin-media.ts`; use it from TikHub normalization and content-pool raw repair instead of broad recursive URL fallback for Douyin image posts.
- Shared remote media request headers belong in `src/lib/media-request.ts`; browser preview proxying belongs in `src/app/api/media/proxy/route.ts`.
- Runtime local media serving belongs in `src/app/api/media/local/[...path]/route.ts`, with browser-stable rewrites configured in `next.config.ts` for `/media/crawl/:path*` and `/generated/:path*`.
- Crawl-stage content safety filtering belongs in `src/lib/source-safety.ts`; API routes and simple-run workflow should call it before source tagging and content-pool ingest instead of embedding safety prompts or local rule lists inline.
- Crawled content and visual AI tagging belongs in `src/lib/source-tagging.ts`; API routes should call it but not embed tag prompts or normalization rules.
- For video/mixed source items with extracted `videoFrames`, visual tagging must use the frames instead of preview images or covers.
- For video/mixed source items, backend write paths should expose at most 5 selected video highlight frames and should remove stale unselected local frame URLs from `mediaUrls`.

## Backend Rules

- Keep external API calls server-side.
- Do not expose API keys or tokens through API responses.
- TikHub, media cache, GPT, image-generation, Feishu, and production fan-out should use the shared pools from `src/lib/concurrency.ts`; do not introduce new hard-coded provider concurrency numbers in feature code.
- Simple-mode API routes should enqueue work and return run state; long-running simple workflow execution belongs in the simple-run worker path, not in the API route handler.
- Do not wrap a task in the same pool that its nested HTTP request also needs, because that can deadlock when the outer fan-out fills the pool. Platform fan-out can be locally bounded while each TikHub HTTP request acquires the crawl pool.
- Do not add broad catch-and-ignore behavior around external calls. Return or record actionable errors.
- Crawl request parameters belong before provider calls. Do not add post-crawl local keyword relevance filters, Xiaohongshu image/video post-filters, all-type fallback searches, or cross-platform result drops in the ingest path; after crawling, only dedupe, slice, cache media, content safety assessment/filtering, tag, and persist. Content safety filtering is limited to profanity, insult, strong negative sentiment, and competitor bashing and must not become a keyword relevance filter.
- Link batch import is an exact-source ingest path, not keyword search. It should not mutate keyword crawl request mapping. Advanced `/api/crawl/links` persists imported items into the content pool, while simple-run link mode must enqueue through `/api/simple/runs`, resolve links server-side, skip keyword platform search/top-up, and then reuse the same media cache, source safety, source tagging, content-pool ingest, production, and publish boundaries as keyword simple runs.
- Douyin `content_type=2` image requests are allowed a narrow media-normalization guard: keep true raw carousel/image records, skip video-cover-only records returned by the provider, and strip direct video media from kept image records so image-only crawls do not generate video frames.
- Weibo App search normalization must use a dedicated `mblog` extractor and content-image field extraction. Do not rely on generic likely-array selection or broad raw-record image fallback for Weibo, because App payloads include layout objects, avatars, and ad/icon media near the actual post records.
- Source visual tagging must preflight remote HTTP(S) image assets and sniff local app-served image bytes before model calls: use shared media request headers, validate supported JPEG/PNG/GIF/WebP content, convert valid images to inline data URLs, and record per-asset skips for invalid/unsupported assets.
- Crawled image cache paths must be browser-readable before they are exposed as `downloadedImages`; HEIC bytes should be converted to JPEG in place, and unsupported cached image bytes should be surfaced as download errors instead of silent broken previews.
- Do not use production external services in default verification.

## Frontend Rules

- Keep the first screen as the usable workspace, not a landing page.
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
- Do not mutate `data/`, `public/generated/`, `public/media/`, `.tmp-*.json`, or `test-artifacts/` during Harness-only work except through explicit verification that is documented.
- Do not reintroduce JSON file read/write stores for content pool, generated posts, batch jobs, material library, execution logs, crawl jobs, simple runs, or runtime posts.
- Runtime PostgreSQL tables should store metadata, indexed status/time fields, and JSON payloads; do not store crawled/generated media binaries in PostgreSQL.
- `simple_run_queue` is a runtime coordination table. Keep external provider calls outside database transactions; claim/heartbeat/complete updates should be short row-level mutations.
- Content-project runtime writes should use row-level upsert, not full-table replacement. Full-table replacement is unsafe for concurrent content-pool source-status updates on PostgreSQL.
- Generated-post runtime save/update/status/delete operations should use row-level upsert/delete, not full-table replacement. Full-table replacement is unsafe for concurrent generated-post status updates on PostgreSQL.

## Deployment Rules

- Confirmed entries are `npm run dev`, `npm run build`, and `npm run start`.
- For the local LAN production server on port `3001`, use `npm run local:restart` after frontend or API code changes. Do not rely on `npm run build` alone to refresh an already-running `next start` process.
- Use `npm run dev:lan` when hot reload is desired during active frontend development.
- Do not add a new deployment path, process manager, service file, or server target without updating `project_brief.md`, `decisions.md`, `verification.md`, and `handoff.md`.

## Harness Rules

- `docs/harness/` is the only persistent context.
- `feature_list.json` is a state machine, not a loose todo list.
- A feature cannot be `done` without evidence.
- Update `progress.md` and `handoff.md` after meaningful development, debugging, deployment, or analysis.
