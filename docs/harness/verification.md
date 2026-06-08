# Verification

Last updated: 2026-06-08

## Baseline Command

Run from project root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1
```

## Current Automated Checks

`scripts/harness/check.ps1` performs:

- Harness file existence validation through `scripts/harness/init.ps1`.
- `feature_list.json` parse and feature-state validation.
- Handoff validation through `scripts/harness/handoff.ps1`.
- Project JSON parse through `scripts/harness/json_check.mjs` for `package.json`, `tsconfig.json`, `docs/harness/feature_list.json`, and existing `data/*.json`.
- PostgreSQL migration schema validation through `scripts/harness/postgres_schema_check.mjs`; this is a static check and does not connect to PostgreSQL.
- No post-crawl keyword filtering validation through `scripts/harness/keyword_relevance_check.mjs`; this verifies `src/lib/tikhub.ts` does not contain local keyword relevance filter helpers and only dedupes/slices collected items before media caching.
- Xiaohongshu request mapping and no post-crawl type filtering validation through `scripts/harness/xiaohongshu_note_type_check.mjs`; this checks App V2 `/api/v1/xiaohongshu/app_v2/search_notes` path construction, `sort_type`, App V2 Chinese `note_type` mapping, default `time_filter/source/ai_mode`, absence of Web V3 search usage, absence of legacy App V2 detail endpoints, absence of selected-type all-note fallback, absence of local image/text versus video post-filter helpers, and a wrapper/nested `noteCard` fixture that preserves real note ids and `xsec_token` without calling external services.
- Weibo App search request mapping validation through `scripts/harness/weibo_search_mapping_check.mjs`; this checks TikHub `/api/v1/weibo/app/fetch_search_all` usage, absence of the old Web V2 endpoint and old `q`/`include_type`/`timescope` parameters, numeric `search_type` mapping for hot/image/video and other saved values, page pagination, App `mblog` extraction despite layout-object noise, Weibo content-image extraction from `pics`/`pic_infos`, decorative image exclusion, and Weibo CDN size-variant dedupe without calling TikHub.
- Douyin general-search request mapping validation through `scripts/harness/douyin_search_mapping_check.mjs`; this checks TikHub `/api/v1/douyin/search/fetch_general_search_v1` usage, absence of old `fetch_video_search_v2`, sort/content-type mapping, `cursor` pagination, `search_id/backtrace` carry-through, stopping after requested target candidates, preserving already-collected candidates when a later mocked pagination page returns `400`, and `contentType=2` image requests skipping video-cover cards while stripping video URLs from kept image records, all without calling TikHub.
- Douyin carousel image extraction validation through `scripts/harness/douyin_carousel_image_check.mjs`; this checks one best supported JPEG/WebP URL per carousel image, Douyin asset-level variant dedupe, HEIC/watermark/cover avoidance, support for more than 18 carousel source images, and content-pool raw repair wiring without calling TikHub.
- Xiaohongshu media URL normalization validation through `scripts/harness/media_url_filter_check.mjs`; this verifies App V2 `rednotecdn` blurry `!nd_prv` plus clear `!nd_dft` variants collapse to one asset with the clear URL kept, xhscdn preview/detail variants collapse to one clear URL, stale overlong `downloadedImages` are dropped instead of misaligned to blurred local files, fresh aligned downloads remain preferred, and media-cache status does not count stale local images as complete.
- Media cache image format validation through `scripts/harness/media_cache_image_format_check.mjs`; this checks shared image byte sniffing for HEIC/WebP/JPEG, HEIC not being treated as browser/model-supported content, media-cache HEIC-to-JPEG transcode wiring, unsupported cached image removal, local media byte-based content type inference, source-tagging reuse of the shared model-supported helper, and frontend local media preview cache-busting.
- Video highlight-frame policy validation through `scripts/harness/video_frame_policy_check.mjs`; this checks the global 5-frame cap, best-frame ranking/deduplication, stale local frame URL cleanup in `mediaUrls`, and static integration across media cache, media backfill, content-pool, production controls, source tagging, frontend preview, and the Harness baseline without calling external services.
- Provider concurrency integration validation through `scripts/harness/concurrency_check.mjs`; this checks global pool defaults/caps and static call-site integration without calling TikHub, OpenAI-compatible services, RunningHub, or Feishu.
- Feishu publish resume validation through `scripts/harness/feishu_publish_resume_check.mjs`; this checks per-post Feishu publish state, `attachment_failed`, record-id reuse, low attachment concurrency, sanitized CLI error capture, and API/UI state persistence without calling Feishu.
- Simple crawl top-up and media policy validation through `scripts/harness/simple_crawl_media_policy_check.mjs`; this checks one-pass top-up after underfilled per-platform crawl and no-media source skipping before automatic production without calling TikHub, OpenAI-compatible services, RunningHub, or Feishu.
- Source safety filter validation through `scripts/harness/source_safety_filter_check.mjs`; this uses mocked OpenAI-compatible text-model responses to verify local hard filters, model-backed competitor-bashing filters, objective comparison allowance, kept/filtered result separation, execution-log observability, advanced crawl integration, simple-mode integration, and simple `filteredUnsafe` platform counts without calling TikHub, OpenAI-compatible services, RunningHub, or Feishu.
- Simple/advanced production config sync validation through `scripts/harness/simple_config_sync_check.mjs`; this verifies one-click simple-mode requests include advanced production material paths, the API forwards them, `SimpleRunInput` persists them, and simple-mode generation passes them into `generatePost(...)` while activity logs only a material count.
- Advanced crawl strategy save validation through `scripts/harness/crawl_strategy_save_check.mjs`; this verifies the advanced `保存采集策略` button persists current platform crawl settings for simple mode, does not call `/api/crawl/jobs`, keeps Douyin content type, and does not persist Douyin cookies.
- Simple queue and Feishu chunking validation through `scripts/harness/simple_queue_check.mjs`; this verifies the simple target-count uplift, durable simple-run queue enqueue/claim/heartbeat wiring, PostgreSQL `FOR UPDATE SKIP LOCKED`, Feishu 50-record chunking, and simple UI max-count change without calling TikHub, OpenAI-compatible services, RunningHub, or Feishu.
- Image prompt guard validation through `scripts/harness/image_prompt_guard_check.mjs`; this verifies simple-mode fallback image prompt wiring, generic empty-prompt provider guard behavior, and single-image task prompt tolerance without calling image providers.
- Image task fallback validation through `scripts/harness/image_task_fallback_check.mjs`; this verifies selected source-image tasks fall back to the original source image for recoverable timeout/gateway/5xx provider failures while non-recoverable image-task errors remain hard failures, without calling image providers.
- Source tagging remote/local image preprocessing validation through `scripts/harness/source_tagging_image_check.mjs`; this uses mocked fetches and mocked local files to verify invalid remote visual assets are skipped, valid remote images are converted to supported inline data URLs, unsupported local bytes such as HEIC saved under `.jpg` are skipped by file-header sniffing, and no raw remote image URL reaches the model call.
- Content projects row-level mutation validation through `scripts/harness/content_projects_upsert_check.mjs`; this verifies content-pool runtime writes use row-level upsert for `content_projects`, preserve original `created_at`, and do not call full-table replacement helpers.
- Generated posts row-level mutation validation through `scripts/harness/generated_posts_upsert_check.mjs`; this verifies generated-post runtime save/update/status/delete paths use row-level upsert/delete helpers instead of full-table replacement.
- `npm run lint`.
- `npx --no-install tsc --noEmit`.
- `npm run build`.
- Local production startability smoke:
  - starts the local Next CLI with `next start` on `127.0.0.1`.
  - runs `node scripts/harness/http_smoke.js`.
  - calls only local safe GET endpoints and does not call TikHub, OpenAI, or Feishu.
- SQLite runtime store validation through `node scripts/harness/db_check.mjs`.

Default smoke port: `3310`. Override with:

```powershell
$env:HARNESS_SMOKE_PORT = "3311"
```

## Manual Smoke Command

When a server is already running:

```powershell
node scripts/harness/http_smoke.js http://127.0.0.1:3000
```

## PostgreSQL Migration Checks

Preview current SQLite row counts without connecting to PostgreSQL:

```powershell
npm run db:migrate:postgres -- --dry-run
```

Run the live SQLite-to-PostgreSQL copy only after setting `DATABASE_URL` to a reachable PostgreSQL database:

```powershell
$env:DATABASE_URL = "postgres://user:password@127.0.0.1:5432/fluxpost_studio"
npm run db:migrate:postgres
```

Live local migration completed on 2026-06-04:

- Local PostgreSQL service `postgresql-x64-18` was confirmed running on `127.0.0.1:5432`.
- `DATABASE_URL` was written to `.env.local` without exposing the secret value.
- `npm run db:migrate:postgres` copied current SQLite rows into PostgreSQL.
- Read-only PostgreSQL verification observed app_meta=3, content_projects=7, generated_posts=9, batch_jobs=3, material_folders=0, material_assets=0, execution_logs=300, crawl_jobs=19, runtime_posts=11, simple_runs=4.
- `npm run local:restart` refreshed `http://127.0.0.1:3001`, and `GET /api/config` reported `databaseBackend=postgres` and `postgresConfigured=true`.

## Local Production Restart

After frontend or API changes, refresh the local `http://127.0.0.1:3001/` production server with:

```powershell
npm run local:restart
```

This command runs `npm run build`, stops any process bound to port `3001`, starts `next start -H 0.0.0.0 -p 3001`, and runs `node scripts/harness/http_smoke.js http://127.0.0.1:3001`.

## Recent Verification

- Passed on 2026-06-08 for GitHub upload preparation to `https://github.com/Jacobshujun/fluxpost-studio.git`: `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`. The baseline covered Harness validation, project JSON parsing, static integration checks, `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, local production HTTP smoke on `127.0.0.1:3310`, and SQLite store validation. The run did not trigger live TikHub/OpenAI-compatible/RunningHub/Feishu production work and emitted only known Turbopack tracing warnings plus the expected Node SQLite experimental warning.

- Passed on 2026-06-05 for recently crawled Weibo image display repair: `node scripts/harness/media_cache_image_format_check.mjs`; `node scripts/harness/source_tagging_image_check.mjs`; `node scripts/harness/media_url_filter_check.mjs`; `node scripts/harness/weibo_search_mapping_check.mjs`; `npm run lint`; `npx --no-install tsc --noEmit`; read-only `npm run local:watch-simple -- -Once`; `npm run local:restart`; local HTTP media checks on `http://127.0.0.1:3001` confirming a repaired Weibo cache path returns `200 image/jpeg` and a WebP-in-`.jpg` cache path returns `200 image/webp`; a Playwright image decode check confirming both images load with non-zero dimensions; a follow-up Playwright `小鹏GX` + Weibo content-pool check confirming 19 decoded images and `?v=20260605-image-format-v2` on local media preview URLs; and full `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`. Existing local Weibo HEIC cache files were converted in place under `public/media/crawl/weibo` without changing database URLs. No new live TikHub/OpenAI-compatible/RunningHub/Feishu production work was triggered.

- Passed on 2026-06-05 for Weibo App crawl debugging: `node scripts/harness/weibo_search_mapping_check.mjs`; `node scripts/harness/source_tagging_image_check.mjs`; `node scripts/harness/media_url_filter_check.mjs`; `npm run lint`; `npx --no-install tsc --noEmit`; `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`; and `npm run local:restart`. A live minimal Weibo crawl smoke on `http://127.0.0.1:3001/api/crawl/jobs` with platform `weibo`, keyword `Xiaopeng GX`, `targetCount=1`, `searchType=hot`, and `includeType=pic` hit TikHub `/api/v1/weibo/app/fetch_search_all`, completed with `mediaType=image`, `imageCount=2`, `downloadedImageCount=2`, visual tagging `success`, `visualTags=1`, and one unsupported HEIC visual asset skipped. The live smoke called TikHub and the configured OpenAI-compatible text/vision tagging path, but did not trigger RunningHub image generation or Feishu publish.

- Passed on 2026-06-05 for the compact simple workspace full-width adjustment: `npm run lint`; `npx --no-install tsc --noEmit`; `npm run local:restart`; a Playwright desktop/mobile UI check on `http://127.0.0.1:3001/` confirmed the `精简版` control panel spans the workspace width, no `.simple-run-panel` renders, `.simple-overall-progress` remains visible, and there is no horizontal overflow; `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1` passed. The checks did not submit `/api/simple/runs` and did not trigger live TikHub/OpenAI-compatible/RunningHub/Feishu production work.

- Passed on 2026-06-05 for the compact simple workspace UI: `npm run lint`; `npx --no-install tsc --noEmit`; `npm run build`; elevated `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1` after the expected sandbox `spawn EPERM`; read-only `npm run local:watch-simple -- -Once` confirmed the latest simple run was completed before restart; elevated `npm run local:restart`; and an elevated Playwright desktop/mobile UI check on `http://127.0.0.1:3001/` confirmed default `精简版`, no rendered `.simple-run-panel`, visible `.simple-overall-progress`, no horizontal overflow, and no console/page errors. The checks did not submit `/api/simple/runs` and did not trigger live TikHub/OpenAI-compatible/RunningHub/Feishu production work.

- Passed on 2026-06-05 for crawl-stage source safety filtering: `node scripts/harness/source_safety_filter_check.mjs`; `npx --no-install tsc --noEmit`; `npm run lint`; `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`; read-only `npm run local:watch-simple -- -Once`; `npm run local:restart`; and a Playwright browser smoke on `http://127.0.0.1:3001/` confirmed the page loaded with no console/page errors. The Harness check uses mocked OpenAI-compatible responses and the baseline did not trigger live TikHub/OpenAI-compatible/RunningHub/Feishu production work. `npm run local:restart` refreshed the local production server at `http://127.0.0.1:3001`.

- Passed on 2026-06-05 for the global video highlight-frame policy: `node scripts/harness/video_frame_policy_check.mjs`; `node scripts/harness/source_tagging_image_check.mjs`; `node scripts/harness/simple_crawl_media_policy_check.mjs`; `node scripts/harness/media_url_filter_check.mjs`; `npx --no-install tsc --noEmit`; `npm run lint`; `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`; read-only `npm run local:watch-simple -- -Once`; and `npm run local:restart`. The local app at `http://127.0.0.1:3001` was refreshed and local HTTP smoke passed. No new live TikHub/OpenAI-compatible/RunningHub/Feishu production task was triggered by verification.

- Passed on 2026-06-05 for fixing the latest `小鹏x9` Douyin image-selection one-click issue: read-only `/api/simple/runs`, `/api/workspace/settings`, `/api/activity`, and `/api/content-pool` checks confirmed recent runs carried `platformCrawlSettings.douyin.contentType="2"` but accepted video-like `mediaType="mixed"` source items with `videoFrames`; `node scripts/harness/douyin_search_mapping_check.mjs`; `node scripts/harness/douyin_carousel_image_check.mjs`; `npx --no-install tsc --noEmit`; `npm run lint`; `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`; read-only `npm run local:watch-simple -- -Once`; and approved elevated `npm run local:restart` passed after the expected sandbox `spawn EPERM`. Local HTTP smoke passed on `http://127.0.0.1:3001`. No new live TikHub/OpenAI-compatible/RunningHub/Feishu production task was triggered.

- Passed on 2026-06-05 for implementing the latest large simple/batch-style run fix: simple-mode crawl top-up, no-media automatic-production skip, Feishu attachment low-concurrency/resume state, token redaction checks, and frontend/API state persistence. Verification commands: `node scripts/harness/feishu_publish_resume_check.mjs`, `node scripts/harness/simple_crawl_media_policy_check.mjs`, `node scripts/harness/concurrency_check.mjs`, `npx --no-install tsc --noEmit`, `npm run lint`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, read-only `npm run local:watch-simple -- -Once`, and approved elevated `npm run local:restart` after the expected sandbox `spawn EPERM`. Local HTTP smoke passed on `http://127.0.0.1:3001`. No new live TikHub/OpenAI-compatible/RunningHub/Feishu production task was triggered by verification.

- Passed on 2026-06-05 for read-only diagnosis of latest large simple/batch-style run `simple-1780584174898`: read-only `GET /api/config`, `GET /api/simple/runs`, `GET /api/production/batches`, `GET /api/activity`, read-only inspection of `data/feishu-outbox/posts-1780584814861.json`, local attachment-file existence checks under `public/media/crawl` and `public/generated/feishu-attachments`, and code inspection of `src/lib/simple-runs.ts`, `src/lib/image-generation.ts`, `src/lib/feishu-cli.ts`, and `src/lib/concurrency.ts`. Then `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1` passed. No live TikHub/OpenAI-compatible/RunningHub/Feishu production task was triggered.

- Passed on 2026-06-04 for advanced-mode explicit crawl strategy saving: `node scripts/harness/crawl_strategy_save_check.mjs` failed before implementation and passed after; `npm run lint`; `npx --no-install tsc --noEmit`; `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`; `npm run local:watch-simple -- -Once` confirmed the latest simple run was completed before restart; `npm run local:restart` refreshed `http://127.0.0.1:3001`. The new check confirms `保存采集策略` persists current platform crawl controls for simple mode without starting `/api/crawl/jobs`, keeps Douyin content type, and excludes Douyin cookies. No new real TikHub/OpenAI-compatible/RunningHub/Feishu task was triggered by verification.

- Passed on 2026-06-04 for the simple-mode selected image-task transient failure: read-only `/api/simple/runs`, `/api/activity?limit=300`, and `npm run local:watch-simple -- -Once` diagnosed run `simple-1780581455008` as target `3`, produced/published `2`, with source item `douyin-7583713246399286537` failing because both selected image tasks received RunningHub non-JSON `504 Gateway Time-out` HTML; `node scripts/harness/image_task_fallback_check.mjs` failed before implementation and passed after; `node scripts/harness/image_prompt_guard_check.mjs`, `npm run lint`, `npx --no-install tsc --noEmit`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, read-only `/api/simple/runs` confirming no active running/queued simple run, and `npm run local:restart` passed. `http://127.0.0.1:3001` was refreshed. No new real TikHub/OpenAI-compatible/RunningHub/Feishu task was triggered by verification.

- Passed on 2026-06-04 for the simple-mode RunningHub empty-prompt failure: read-only `/api/simple/runs`, `/api/activity`, `/api/content-pool`, and `/api/production/posts` diagnosed no-media source item `douyin-douyin-8` plus empty generated `imagePrompt` as the cause of RunningHub error `1007`; `node scripts/harness/image_prompt_guard_check.mjs` failed before implementation and passed after; `npm run lint`, `npx --no-install tsc --noEmit`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, and `npm run local:restart` passed. `http://127.0.0.1:3001` was refreshed after confirming no active running/queued simple run. No new real TikHub/OpenAI-compatible/RunningHub/Feishu task was triggered by verification.

- Passed on 2026-06-04 for simple-mode high-throughput V1/V2: `node scripts/harness/simple_queue_check.mjs`, `node scripts/harness/simple_config_sync_check.mjs`, `npm run db:migrate:postgres -- --dry-run`, `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, read-only `GET /api/simple/runs` confirming no active running/queued simple run before restart, and `npm run local:restart`. The local app was refreshed at `http://127.0.0.1:3001`. No real TikHub/OpenAI-compatible/RunningHub/Feishu production task was triggered; build emitted only the known Turbopack tracing warnings.

- Passed on 2026-06-04 for the simple-mode publish failure with `content_projects_pkey`: read-only `/api/simple/runs` and `/api/activity?limit=250` diagnosed failed run `simple-1780572602107` as successful crawl/tag/production followed by local content-pool PostgreSQL primary-key collision during publish/source-status updates; `node scripts/harness/content_projects_upsert_check.mjs`, `npm run lint`, `npx --no-install tsc --noEmit`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, and `npm run local:restart` passed. The local app was refreshed at `http://127.0.0.1:3001`. No new real TikHub/OpenAI-compatible/RunningHub/Feishu task was triggered by verification.

- Passed on 2026-06-04 for the simple-mode Douyin pagination failure fix: read-only `/api/simple/runs` and `/api/activity?limit=200` diagnosed failed run `simple-1780571959657` as a first-page `200` followed by a later-page TikHub `400` on `/api/v1/douyin/search/fetch_general_search_v1`; `node scripts/harness/douyin_search_mapping_check.mjs`, `npm run lint`, `npx --no-install tsc --noEmit`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, and `npm run local:restart` passed. The local app was refreshed at `http://127.0.0.1:3001`. No new real TikHub/OpenAI-compatible/RunningHub/Feishu task was triggered by verification.

- Passed on 2026-06-04 for simple/advanced one-click production config sync: `node scripts/harness/simple_config_sync_check.mjs`, `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, `npm run local:watch-simple -- -Once`, and `npm run local:restart`. The fix confirmed `productionMaterialPaths` now flow from simple-mode start payload through `/api/simple/runs` into `generatePost(...)`; the local app was refreshed at `http://127.0.0.1:3001`. No real TikHub/OpenAI-compatible/RunningHub/Feishu task was triggered by verification.

- Passed on 2026-06-04 for PostgreSQL migration bug sweep and visual-tagging remote image preprocessing: `node scripts/harness/source_tagging_image_check.mjs`, `node scripts/harness/generated_posts_upsert_check.mjs`, `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, `npm run local:restart`, `node scripts/harness/http_smoke.js http://127.0.0.1:3001`, and read-only `/api/config` confirming `databaseBackend=postgres`. The checks did not trigger real TikHub/OpenAI-compatible/RunningHub/Feishu tasks; the latest partial simple-run record with `generated_posts_pkey` was left as historical runtime state.

- Passed on 2026-06-04 for fixing Douyin image/text carousel extraction after the live `小鹏X9` crawl: `node scripts/harness/douyin_carousel_image_check.mjs`, `node scripts/harness/douyin_search_mapping_check.mjs`, `node scripts/harness/media_url_filter_check.mjs`, `node scripts/harness/xiaohongshu_note_type_check.mjs`, `npm run lint`, `npx --no-install tsc --noEmit`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, `npm run local:watch-simple -- -Once`, and `npm run local:restart`. Post-restart read-only `/api/content-pool` check on `http://127.0.0.1:3001` confirmed Douyin `sourceId=7647456408942589300` now exposes `images=32`, `downloadedImages=0`, `cacheStatus=remote_only`, `remoteImages=32`, and no HEIC/watermark/cover variants. No real TikHub/OpenAI-compatible/RunningHub/Feishu task was triggered by verification.

- Passed on 2026-06-04 for switching Douyin keyword search to TikHub general search V1 and confirming request mappings: `node scripts/harness/douyin_search_mapping_check.mjs`, `npx --no-install tsc --noEmit`, `npm run lint`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, `npm run local:watch-simple -- -Once`, and `npm run local:restart`. The check confirms `/api/v1/douyin/search/fetch_general_search_v1`, no old `fetch_video_search_v2` usage, sort mapping `0/1/2`, content-type mapping `0/1/2/3`, `cursor` pagination, and `search_id/backtrace` carry-through. The local server at `http://127.0.0.1:3001` was refreshed and local HTTP smoke passed. No real TikHub/OpenAI-compatible/RunningHub/Feishu production task was triggered by verification.

- Passed on 2026-06-04 for Xiaohongshu duplicate-image normalization: `node scripts/harness/media_url_filter_check.mjs`, `npm run lint`, `npx --no-install tsc --noEmit`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, and `npm run local:restart`. A read-only post-restart check of the latest local `小鹏P7` content-pool sample `sourceId=6a1b0255000000003700fbcd` observed `imagesCount=5`, `downloadedCount=0`, `imagesAreDefault=true`, `cacheStatus=remote_only`, `localImages=0`, and `remoteImages=5`. No new TikHub/OpenAI-compatible/RunningHub/Feishu production task was triggered by verification.

- Passed on 2026-06-04 for switching Xiaohongshu keyword search to TikHub App V2 `search_notes`: `node scripts/harness/xiaohongshu_note_type_check.mjs`, `node scripts/harness/keyword_relevance_check.mjs`, `node scripts/harness/concurrency_check.mjs`, `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `npm run local:restart`, and `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`. A live target-1 advanced Xiaohongshu crawl for keyword `小鹏G6`, sort `time_descending`, image/text `noteType=2`, called `GET /api/v1/xiaohongshu/app_v2/search_notes`, logged `requestedNoteTypeParam=普通笔记`, and returned one image item titled `被这台小鹏G6硬控了！` with real `sourceId=6a213dcf000000003503291b`, six source images, six downloaded images, and zero video frames.

- Passed on 2026-06-04 for deleting Xiaohongshu App V2 detail usage and preserving Web V3 note identity: `npm run build`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, and `npm run local:restart`. A live target-1 advanced Xiaohongshu crawl for keyword `小鹏G6`, sort `time_descending`, image/text `noteType=2`, completed through Web V3 only with real `sourceId=6a110db30000000007028960`, `contentText` length 428, two source images, two downloaded images, and twelve video frames. Residual risk observed: TikHub Web V3 provider ordering returned a `小鹏GX` titled item for the `小鹏G6` keyword under the current no-post-crawl-filter rule.

- Passed on 2026-06-04 for removing remaining crawl post-filters: `node scripts/harness/keyword_relevance_check.mjs`, `node scripts/harness/xiaohongshu_note_type_check.mjs`, `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, and `npm run local:restart`. `http://127.0.0.1:3001` was refreshed and local HTTP smoke passed. No live TikHub/OpenAI-compatible/RunningHub/Feishu production task was triggered by verification.

- Passed on 2026-06-04 for the content-pool residual filter fix: `npm run lint`, `npx --no-install tsc --noEmit`, `node scripts/harness/keyword_relevance_check.mjs`, `node scripts/harness/xiaohongshu_note_type_check.mjs`, `npm run local:restart`, and `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`. A live Xiaohongshu `小鹏G6`, image/text, latest, target-1 crawl completed with `returnedItems=1` and `projectTotalItems=1`.

- Historical verification on 2026-06-04 for an earlier Xiaohongshu crawl fix, superseded by the current no-post-filter policy: `node scripts/harness/keyword_relevance_check.mjs`, `node scripts/harness/xiaohongshu_note_type_check.mjs`, `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, and `npm run local:restart`. `http://127.0.0.1:3001` was refreshed and local HTTP smoke passed. No live TikHub/OpenAI-compatible/RunningHub/Feishu task was triggered by verification.

- Passed on 2026-06-04 for application-level high-throughput concurrency: `node scripts/harness/concurrency_check.mjs`, `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, and `npm run local:restart`. `http://127.0.0.1:3001` was refreshed and local HTTP smoke passed. No live TikHub/OpenAI-compatible/RunningHub/Feishu production task was triggered by verification.

- Passed on 2026-06-04 for deleting local crawl hard filters after `小鹏P7` crawl failures: `node scripts/harness/keyword_relevance_check.mjs`, `node scripts/harness/xiaohongshu_note_type_check.mjs`, `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, and elevated `npm run local:restart` after sandbox `spawn EPERM`. `http://127.0.0.1:3001` was refreshed and local HTTP smoke passed. No live TikHub/OpenAI-compatible/RunningHub/Feishu production task was triggered by verification.

- Passed on 2026-06-04 for fixed Xiaohongshu Web V3 search usage and diagnostics: `node scripts/harness/xiaohongshu_note_type_check.mjs`, `node scripts/harness/keyword_relevance_check.mjs`, `npx --no-install tsc --noEmit`, `npm run lint`, `npm run build`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, and elevated `npm run local:restart` after sandbox `spawn EPERM`. The local app at `http://127.0.0.1:3001` was refreshed and local HTTP smoke passed. No live TikHub/OpenAI-compatible/RunningHub/Feishu task was triggered by verification.

- Passed on 2026-06-04 for simple-mode Xiaohongshu image/text crawl preference enforcement: `node scripts/harness/xiaohongshu_note_type_check.mjs`, `node scripts/harness/keyword_relevance_check.mjs`, `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, and `npm run local:restart`. The local check confirms internal `noteType=2` maps to TikHub image/text `note_type=1` and locally drops video-like notes. No live TikHub/OpenAI-compatible/RunningHub/Feishu task was triggered by this verification.

- Passed on 2026-06-04 for keyword relevance filtering and model-name special-symbol boundaries: `node scripts/harness/keyword_relevance_check.mjs`, `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, and `npm run local:restart`. The check confirms `小鹏P7` and `小鹏P7+` do not match each other by substring. No live TikHub/OpenAI-compatible/RunningHub/Feishu task was triggered by this verification.

- Passed on 2026-06-04 for simple/advanced crawl preference sync: mocked Playwright request-body check on `http://127.0.0.1:3001` intercepted `POST /api/simple/runs` and confirmed advanced `platformCrawlSettings` for Xiaohongshu, Douyin, Weibo, and WeChat Channels are included in the simple-mode payload. The check fulfilled the POST locally and did not trigger a real TikHub/OpenAI-compatible/RunningHub/Feishu task. `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1` passed, and `npm run local:restart` refreshed `http://127.0.0.1:3001` with local HTTP smoke passing.

- Passed on 2026-06-04 for image-generation timeout fallback and reference normalization: `ffmpeg -version`, `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, elevated `npm run local:restart` after a sandbox `spawn EPERM`, and `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`. No live TikHub/OpenAI-compatible/RunningHub/Feishu production task was triggered by the baseline.

- Passed on 2026-06-04 for simple-mode workspace ratio update: `npm run lint`, `npx --no-install tsc --noEmit`, `npm run local:restart`, Playwright desktop layout check on `http://127.0.0.1:3001` confirming the status panel is wider than the control panel and the four stage cards remain four rows with no horizontal overflow or console errors, Playwright mobile layout check confirming no horizontal overflow at 390px, and `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`.

- Passed on 2026-06-04 for simple-mode automatic task status layout: `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `npm run local:restart`, Playwright DOM/layout check on `http://127.0.0.1:3001` confirming four `.simple-stage-card` elements render in four unique vertical positions with no horizontal overflow or console errors, and `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`.

- Passed on 2026-06-04 for live PostgreSQL migration: PostgreSQL 18 service availability check, temporary local authentication provisioning with restoration to `scram-sha-256`, `npm run db:migrate:postgres`, read-only PostgreSQL table-count verification, `npm run local:restart`, `node scripts/harness/http_smoke.js http://127.0.0.1:3001`, read-only `GET /api/config` confirming `databaseBackend=postgres`, and `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`.

- Passed on 2026-06-03 for RunningHub image provider integration: `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `npm run local:restart`, and `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`.
- Passed on 2026-06-03 read-only local config check after restart: `GET http://127.0.0.1:3001/api/config` reported `imageProvider=runninghub`, `imageModel=nano-banana-pro`, `runningHubConfigured=true`, and `runningHubBaseUrl=https://www.runninghub.cn`. No RunningHub generation task was submitted by this config check.

- Passed on 2026-06-03 for simple-mode stuck-run mitigation: `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, and `npm run local:restart`.
- Passed on 2026-06-03 read-only checks on `http://127.0.0.1:3001`: `npm run local:watch-simple -- -Once`, `GET /api/config`, and `GET /api/simple/runs`. These checks did not trigger new TikHub, OpenAI-compatible, image-generation, or Feishu production calls.

- Passed on 2026-06-03 for PostgreSQL runtime migration groundwork: `npm run db:migrate:postgres -- --dry-run`, `node scripts/harness/postgres_schema_check.mjs`, `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, and `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`.
- The PostgreSQL baseline addition is a static schema check and does not connect to a live PostgreSQL server. A live migration was not executed because no `DATABASE_URL`/PostgreSQL service was confirmed in this turn.
- The local `http://127.0.0.1:3001` production server was not restarted after the PostgreSQL changes because `npm run local:watch-simple -- -Once` showed a real simple run still `running` in the image-generation stage.

- Passed on 2026-06-03 for switching image generation to `nano-banana-pro`: `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, `npm run local:restart`, `node scripts/harness/http_smoke.js http://127.0.0.1:3001`, and read-only `GET /api/config` confirmed the running local app reports `imageModel=nano-banana-pro`.

- Passed on 2026-06-03 for custom visual-tag image prompt recheck: `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, `npm run local:watch-simple -- -Once`, `node scripts/harness/http_smoke.js http://127.0.0.1:3001`, and read-only `GET /api/workspace/settings` on `http://127.0.0.1:3001` confirmed `carExterior`, `textImage`, and `peopleWithCar` prompt keys are available from the running local app.
- Passed on 2026-06-03 for visual-tag image strategy prompt routing: `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, and `npm run local:restart`.
- Passed on 2026-06-03 browser/API smoke on `http://127.0.0.1:3001`: simple mode shows one text prompt plus three image strategy prompts and reset buttons with no horizontal overflow; advanced production shows the three image strategy prompts and original-reference rule with no horizontal overflow; `/api/workspace/settings` returns `carExterior`, `textImage`, and `peopleWithCar` prompt keys.

- Passed on 2026-06-03 for simple-mode editable prompt settings: `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, and `npm run local:restart`.
- Passed on 2026-06-03 browser UI smoke on `http://127.0.0.1:3001`: desktop `1440x950` and mobile `390x844` confirmed two simple-mode prompt textareas, two reset buttons, the prompt-save action, no console errors, and no horizontal overflow.
- Passed on 2026-06-03 for simple-version automatic workflow UI and APIs: `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, and `npm run local:restart`.
- Passed on 2026-06-03 browser UI smoke on `http://127.0.0.1:3001`: simple workspace, keyword field, simple start button, advanced module switcher after switching modes, and no horizontal overflow on desktop `1440x950` or mobile `390x844`.
- Passed on 2026-06-03 for simple-run slowness mitigation and terminal backend watcher: `npm run local:watch-simple -- -Once`, `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, and `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`.
- Passed on 2026-06-03 for simple-mode nine-image cap and bounded image concurrency: `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, and `npm run local:watch-simple -- -Once`. No external TikHub/OpenAI/Feishu call was triggered by verification.
- Passed on 2026-06-03 for Feishu notification env and recipient precedence: `.env.local` updated without exposing values, `src/lib/feishu-cli.ts` prefers `FEISHU_NOTIFY_CHAT_ID` when both notification recipients are configured, `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, and `npm run local:restart`. A manual Feishu CLI task brief send also succeeded for the completed simple run.
- Passed on 2026-06-03 for Feishu remote image attachment materialization: `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, and `npm run local:restart`. A real publish retry for the failed generated post created a Feishu Base record and uploaded 12 remote image-model URLs as attachments after downloading them locally; a manual Feishu repair brief send also succeeded.
- Passed on 2026-06-03 for video frame-first preview/tagging/task behavior: `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `npm run local:restart`, and `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`.
- Passed on 2026-06-03 browser check on `http://127.0.0.1:3001`: Douyin sample `douyin-7639960163977784475` visible preview loaded `/frames/cover.jpg` and no visible original `image-*` source image in the current viewport.

- Passed on 2026-06-03 for runtime local media serving: `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `npm run local:restart`, and `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`.
- Passed on 2026-06-03 real Douyin API smoke: `POST /api/crawl/jobs` with platform `douyin`, keyword `小鹏GX`, and `targetCount=1` returned one completed item with local images, a local mp4, local frames, and `mediaCache.status=local_complete`.
- Passed on 2026-06-03 HTTP local media smoke on `http://127.0.0.1:3001`: Douyin local image/frame returned 200, local mp4 returned 200, and a video range request returned 206.
- Passed on 2026-06-03 Chromium local media smoke on `http://127.0.0.1:3001`: Douyin source image, cover frame, and mp4 metadata loaded from `/media/crawl/...`.

- Passed on 2026-06-03 for the Weibo crawl response fix: `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, and local restart on `http://127.0.0.1:3001`.
- Passed on 2026-06-03 real Weibo API smoke: `includeType=all` returned only Weibo items for keyword `小鹏GX`; `includeType=pic` returned three Weibo image posts with local downloaded image counts `5`, `3`, and `3`.
- Passed on 2026-06-03 for local media persistence/backfill: `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, and `npm run local:restart`.
- Passed on 2026-06-03 for local media persistence/backfill browser/API smoke on `http://127.0.0.1:3001/`: Playwright confirmed `补全本地素材` and `本地素材缓存` render with no console errors or horizontal overflow; API smoke confirmed `POST /api/content/items/batch` with `action=cache_media` returns `updatedCount=0` and one not-found id for a missing source id.
- Passed on 2026-06-03 for remote media proxy preview fix: `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `npm run local:restart`, and `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`.
- Passed on 2026-06-03 browser check on `http://127.0.0.1:3001/`: selected Xiaohongshu item `xiaohongshu-6a0db7220000000006020fad`; visible proxied remote images loaded with dimensions and no broken visible images.
- Passed on 2026-06-03 for AI source tagging: `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`, and `npm run local:restart`.
- Passed on 2026-06-03 browser check on `http://127.0.0.1:3001/`: Playwright switched to a non-empty content project and confirmed AI tag overview plus manual content/visual tag editors render with no console errors.
- Passed on 2026-06-02: `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`.
- The baseline parsed project JSON, ran lint, ran TypeScript `noEmit`, built Next successfully, started a local production server on `http://127.0.0.1:3310`, and passed local HTTP smoke.
- Passed on 2026-06-02 for the module-boundary fix: `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, and the full Harness baseline with approved elevated permissions.
- Passed on 2026-06-02: Playwright browser check on `http://127.0.0.1:3001/` for desktop `1440x950` and mobile `390x844`; production module did not render content-pool controls and had no horizontal overflow or console errors.
- Passed on 2026-06-02 for the Xiaohongshu image fix: `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, and the full Harness baseline with approved elevated permissions.
- Passed on 2026-06-02: read-only local content-pool audit of Xiaohongshu records confirmed the new downloaded/remote image merge covers each source image position with a local cache URL or original remote image URL.
- Passed on 2026-06-02 for SQLite runtime persistence: `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, and `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`.
- The passing baseline included SQLite table validation for `data/fluxpost.db`; observed counts were `content_projects=6` and `execution_logs=300`.
- Passed on 2026-06-02 for the Weibo image-empty fix: `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, and `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`.
- Passed on 2026-06-02 for the restarted local app: `node scripts/harness/http_smoke.js http://127.0.0.1:3001`.
- Passed on 2026-06-02 for the Xiaohongshu empty-image display fix: `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, and `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`.
- Passed on 2026-06-02: `node scripts/harness/http_smoke.js http://127.0.0.1:3001` after restarting the local app.
- Passed on 2026-06-02 with approved elevated permissions: Playwright image-load check confirmed a Xiaohongshu remote image loads with `no-referrer` and a local cached Xiaohongshu image loads from the app server.
- Passed on 2026-06-02 for the `原图引用` image strategy: `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, and `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`.
- Passed on 2026-06-02 for the restarted local app after `原图引用`: `node scripts/harness/http_smoke.js http://127.0.0.1:3001`.
- Passed on 2026-06-02 for Feishu CLI readiness: `lark-cli config show`, `lark-cli doctor --offline`, and `lark-cli doctor` with `LARK_CLI_NO_PROXY=1` and proxy env values cleared. This verified local CLI config, bot identity, and Feishu endpoint reachability without exposing secrets.
- Passed on 2026-06-02 for Feishu publish wrapper adaptation: `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, and the full Harness baseline.
- Passed on 2026-06-02 for Feishu publish feedback and optional notification: `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, and `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`.
- Passed on 2026-06-02: Playwright mocked publish check on `http://127.0.0.1:3001/` confirmed the publish button sends `POST /api/publish/feishu`, shows running feedback, shows success feedback, and shows skipped notification status when no recipient is configured.
- Passed on 2026-06-02 after restarting the local app on port `3001`: `node scripts/harness/http_smoke.js http://127.0.0.1:3001`.
- Build warnings observed: Turbopack tracing warnings involving `src/lib/media-cache.ts` and `next.config.ts`. These warnings did not fail the build.

## Missing Coverage

- No unit tests are defined in `package.json`.
- No isolated TikHub/OpenAI/Feishu integration tests are configured.
- No isolated end-to-end test for `POST /api/simple/runs` is configured because it calls TikHub, OpenAI-compatible models, image generation, and Feishu publishing.
- No browser UI walkthrough is part of the baseline.
- Terminal watcher coverage is manual; `npm run local:watch-simple -- -Once` verifies the script can read local backend state, but continuous monitoring is not part of the baseline.
- `ffmpeg` availability and real video frame extraction are not verified by default baseline.
- No live PostgreSQL service migration or multi-user database concurrency test is configured.

## Manual Verification Targets

- UI loads in desktop and mobile viewport.
- Simple mode can run one real small-count keyword task, generate posts, write Feishu records, and store `内容标签` as a Base multi-select value.
- Keyword crawl returns relevant items for each configured platform when TikHub credentials are valid.
- Generated posts include complete text and selected image handling behavior.
- Video source items with extracted frames show frames as image preview and do not duplicate a separate high-frame gallery.
- Feishu publish writes the expected Base payload or outbox file.
- Video downloads and frames appear under `public/media/crawl` when the source video URL is downloadable.
- Runtime local media URLs under `/media/crawl/...` and `/generated/...` load in the browser after files are created post-build.
