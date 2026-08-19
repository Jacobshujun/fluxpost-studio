# Architecture Rules

Last updated: 2026-07-20

## Module Boundaries

- Main workspace UI stays under `src/app/page.tsx`, standalone content harvesting/pool operations live under `src/app/content/page.tsx`, and shared styling stays under `src/app/globals.css` unless a task explicitly scopes another component split.
- API routes under `src/app/api/**/route.ts` should stay thin and delegate domain work to `src/lib/*`.
- Platform crawling belongs in `src/lib/tikhub.ts`.
- Source link batch-import orchestration belongs in `src/lib/source-link-import.ts`; the API route should stay thin and delegate to that helper. Reusable source-link resolution for simple-run link mode also belongs in this module. TikHub platform detail/share endpoint construction and response normalization for source links still belong in `src/lib/tikhub.ts`.
- Source-link-only local importers belong in their own `src/lib/*` modules and should be dispatched from `src/lib/source-link-import.ts`. Dongchedi article parsing belongs in `src/lib/dongchedi.ts`; it should canonicalize current `/article/{id}` URLs while accepting legacy `/ugc/article/{id}` inputs, normalize embedded article data as `platform="dongchedi"`, and fail clearly on anti-bot challenge HTML.
- Feishu task-number content import belongs in `src/lib/feishu-content-import.ts`. It should read configured Base records by `任务编号`, download `动态素材` attachments through the Base attachment download command, normalize imported records as `NormalizedSourceItem` with `platform="feishu"`, and leave generated-post publishing to the existing Feishu publish path.
- Feishu distribution audit belongs in `src/lib/distribution-check.ts`. The API route `src/app/api/distribution-check/route.ts` should stay thin, require workspace auth, and delegate to the helper. The helper should enqueue durable jobs for large batches, run background workers with dedicated distribution concurrency pools, use `lark-cli base +field-list`, `+record-search` or `+record-get`, and grouped `+record-batch-update`, writing `是否分发` and `内容评分` only.
- Content pool persistence belongs in `src/lib/content-pool.ts`.
- Batch production persistence belongs in `src/lib/batch-production.ts`.
- Generated post persistence belongs in `src/lib/generated-posts.ts`.
- TOS-backed reference/vehicle library persistence and selection validation belong in `src/lib/library-assets.ts`.
- Execution logs belong in `src/lib/activity-log.ts`.
- Normal execution-log appends use the row-level append helper in `src/lib/database.ts`; regular log writes must not read and rewrite the whole execution-log table.
- Runtime storage backend selection, SQLite/PostgreSQL connection setup, schema setup, legacy JSON migration, and persistence helpers belong in `src/lib/database.ts`.
- Workspace account/session persistence schema belongs in `src/lib/database.ts` and `db/migrations/001_initial_postgres.sql`; whitelist auth parsing, admin username parsing, account-table creation/password hashing, session lookup, and request auth helpers belong in `src/lib/workspace-accounts.ts`.
- Environment-derived app configuration belongs in `src/lib/config.ts`. Advanced configuration UI may read/write only the allow-listed definitions in that module through `src/app/api/config/route.ts`; do not read `.env.local` in React components or expose raw `process.env` values through API responses.
- Workspace owner-scope helpers belong in `src/lib/workspace-ownership.ts`. Domain stores should use those helpers instead of duplicating admin/member owner checks.
- Durable simple-run queue schema, enqueue/claim/heartbeat helpers, and PostgreSQL `FOR UPDATE SKIP LOCKED` queue claiming belong in `src/lib/database.ts`; simple-run worker orchestration belongs in `src/lib/simple-runs.ts`.
- Durable Feishu publish queue schema, save/list/claim/heartbeat helpers, and PostgreSQL `FOR UPDATE SKIP LOCKED` queue claiming belong in `src/lib/database.ts`; Feishu publish queue orchestration belongs in `src/lib/feishu-publish-queue.ts`.
- Durable distribution-check job schema, save/list/claim/heartbeat helpers, and PostgreSQL `FOR UPDATE SKIP LOCKED` queue claiming belong in `src/lib/database.ts`; distribution-check worker orchestration belongs in `src/lib/distribution-check.ts`.
- Application-level concurrency limits and shared provider pools belong in `src/lib/concurrency.ts`.
- PostgreSQL schema files belong in `db/migrations/`; SQLite-to-PostgreSQL copy scripts belong in `scripts/db/`.
- Text generation belongs in `src/lib/openai.ts`.
- Image generation belongs in `src/lib/image-generation.ts`.
- OpenAI-compatible Images API support belongs in `src/lib/image-generation.ts`, including local/remote reference-image normalization, multipart `/images/edits` upload, JSON `/images/generations` requests, and image-provider retry/fallback behavior.
- ToAPIs GPT-Image-2 payload/response mapping belongs in `src/lib/toapis-image-api.ts`; asynchronous submission, upload, polling, failover, and final runtime-media persistence orchestration remains in `src/lib/image-generation.ts`.
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
- HEIC-to-JPEG decoding and atomic staged-file replacement belong in `src/lib/image-normalization.ts`; media cache and direct keep-mode generation must share it.
- Lightweight Douyin image/text carousel URL extraction belongs in `src/lib/douyin-media.ts`; use it from TikHub normalization and content-pool raw repair instead of broad recursive URL fallback for Douyin image posts.
- Shared remote media request headers belong in `src/lib/media-request.ts`; browser preview proxying belongs in `src/app/api/media/proxy/route.ts`.
- Browser preview URL selection belongs in client-safe `src/lib/media-preview.ts`. Historical generated-media scan/apply logic belongs in `src/lib/generated-media-repair.ts`; `src/app/api/config/media-repair/route.ts` must stay admin-only and thin.
- Runtime local media serving belongs in `src/app/api/media/local/[...path]/route.ts`, with browser-stable rewrites configured in `next.config.ts` for `/media/crawl/:path*` and `/generated/:path*`.
- Review-desk per-image prompt regeneration should reuse `POST /api/images` with a single-image request, update only the selected `imageUrls[index]` in the local draft, and persist through the existing generated-post review save path.
- Content-safety policy validation, shipped defaults, `app_meta` persistence, and local rule evaluation belong in `src/lib/content-safety-policy.ts`. Provider dispatch and item filtering belong in `src/lib/source-safety.ts`; routes and workflows must pass frozen policy snapshots instead of embedding prompts/rules or rereading mutable policy during execution.
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
- Simple production uses only run-frozen workspace prompts and explicit media switches; never enforce source-derived production plans.
- Simple-mode publish preparation should serialize local approved-post persistence before enqueueing the Feishu publish job. Feishu queue local generated-post persistence must also stay serialized before durable queue creation and after Feishu publish completion; do not fan out `persistOnePost` with `Promise.all`. Feishu CLI work remains asynchronous in `src/lib/feishu-publish-queue.ts`.
- Feishu publish API routes should enqueue work and expose read-only job polling; long-running Feishu CLI execution belongs in the Feishu publish queue worker, not in the API route handler or simple-run worker.
- Feishu publish queue code must keep queue ownership separate from generated-post ownership. Manual publish should use the current account as the queue owner, but enqueueing must not rewrite `GeneratedPost.ownerUserId`/`ownerDisplayName` to the queue owner; admins can publish visible posts without taking ownership of those posts.
- All workspace content APIs, including reads, should use `requireWorkspaceAccount(...)` and pass the current account into domain store calls so normal members see only their own owner-scoped records while admins see all records.
- All mutating workspace API routes should use `requireWorkspaceAccount(...)` before local writes, queue creation, or external provider calls, and carry the account id into record/queue ownership where relevant. Do not duplicate whitelist parsing, password checking, cookie parsing, or session-token hashing in API routes.
- The Feishu/Lark IM task route is the narrow exception to browser-cookie workspace auth because it is a local CLI ingress. It must require `LARK_TASK_API_TOKEN`, enforce `LARK_TASK_CHAT_IDS`, map sender ids through `LARK_TASK_USER_MAP` to existing active workspace accounts, persist `lark_task_launches` idempotency before/after launch, and enqueue through `startSimpleRun(...)`. Do not let IM messages call provider workflows directly.
- Do not wrap a task in the same pool that its nested HTTP request also needs, because that can deadlock when the outer fan-out fills the pool. Platform fan-out can be locally bounded while each TikHub HTTP request acquires the crawl pool.
- Do not add broad catch-and-ignore behavior around external calls. Return or record actionable errors.
- Crawl request parameters belong before provider calls. Do not add post-crawl local keyword relevance filters, Xiaohongshu image/video post-filters, all-type fallback searches, or cross-platform result drops in the ingest path; after crawling, only dedupe, slice, cache media, workspace-configured content-safety assessment/filtering, tag, and persist. Content-safety categories are administrator-defined and must not become a hidden keyword relevance filter.
- Link batch import is an exact-source ingest path, not keyword search. It should not mutate keyword crawl request mapping. Advanced `/api/crawl/links` persists imported items into the content pool, while simple-run link mode must enqueue through `/api/simple/runs`, resolve links server-side, skip keyword platform search/top-up, and then reuse the same media cache, source safety, source tagging, content-pool ingest, production, and publish boundaries as keyword simple runs.
- Dongchedi link import must stay source-link/ID-only unless a separate verified keyword provider is added. Do not add `dongchedi` to `CrawlPlatform` or TikHub keyword crawl controls just because it is accepted by source-link import.
- Feishu task-number simple import is a table-record ingest path, not a TikHub crawl platform. Simple-run Feishu mode must enqueue through `/api/simple/runs`, resolve records server-side through `src/lib/feishu-content-import.ts`, skip keyword platform search/top-up, then reuse source safety, source tagging, content-pool ingest, production, image generation, and Feishu publish boundaries. Imported `车型` values should determine the content-pool keyword/project; the fallback keyword is only for records without a vehicle value.
- Source-link import must not write imported source content back to a Feishu Base. Advanced `/api/crawl/links` and simple-run link mode should stop after local content-pool ingest; generated-post publishing remains the only downstream Feishu write path for imported links.
- Douyin `content_type=2` image requests are allowed a narrow media-normalization guard: keep true raw carousel/image records, skip video-cover-only records returned by the provider, and strip direct video media from kept image records so image-only crawls do not generate video frames.
- Weibo App search normalization must use a dedicated `mblog` extractor and content-image field extraction. Do not rely on generic likely-array selection or broad raw-record image fallback for Weibo, because App payloads include layout objects, avatars, and ad/icon media near the actual post records.
- Source visual tagging must preflight remote HTTP(S) image assets and sniff local app-served image bytes before model calls: use shared media request headers, validate supported JPEG/PNG/GIF/WebP content, convert valid images to inline data URLs, and record per-asset skips for invalid/unsupported assets.
- Crawled image cache paths must be browser-readable before they are exposed as `downloadedImages`; HEIC bytes should be converted to JPEG in place, and unsupported cached image bytes should be surfaced as download errors instead of silent broken previews.
- Do not use production external services in default verification.

## Scenario: HEIC Review Delivery And Historical Repair

### 1. Scope / Trigger
- Trigger: source-image bytes are HEIC despite a `.jpg` URL, or an admin repairs exact historical source-image references.

### 2. Signatures
- `POST /api/config/media-repair` accepts `{ mode: "scan" | "apply", cursor?: string, limit?: number }`; default limit is 10 and maximum is 25.

### 3. Contracts
- Final generated images are verified browser-readable local/TOS URLs. Native Volcengine TOS previews bypass body proxying; custom managed TOS URLs redirect with `307`.
- `scan` performs no media/provider calls. `apply` may read public source images and perform verified TOS PUT/HEAD only; it passes `forceImageRefresh=true` and `skipVideoProcessing=true`.

### 4. Validation & Error Matrix
- Non-admin -> `403`; missing session -> `401`; invalid mode/limit -> `400`.
- Invalid HEIC, TOS verification failure, ambiguous source index, changed post/source ordering, or missing replacement -> failure detail and no unsafe image write.

### 5. Good/Base/Bad Cases
- Good: exact source URL/index produces managed JPEG and updates matching final/keep/reference URLs.
- Base: already managed or generated-model images are unchanged; a repeated apply is idempotent.
- Bad: duplicate source URLs or a stale post/source index remain unchanged for manual review.

### 6. Tests Required
- Real HEIC bytes under `.jpg`, invalid HEIC, 1 JPEG + 8 HEIC, proxy/direct preview policy, admin boundary, cursor ordering, wrong index, race, TOS failure, and repeated apply.

### 7. Wrong vs Correct
- Wrong: trust `.jpg`, return the HEIC source URL, proxy TOS bodies through the VPS, or let image repair download video.
- Correct: sniff bytes, convert/validate/atomically replace, persist verified media, return `needs_review` on failure, load native TOS directly, and keep repair image-only.

## Scenario: Admin Advanced Environment Configuration

### 1. Scope / Trigger

- Trigger: `/config` crosses frontend, API, environment-file persistence, and workspace admin authorization.
- Applies to: `src/lib/config.ts`, `src/app/api/config/route.ts`, `src/app/config/page.tsx`, `src/lib/types.ts`, and `.trellis/verification/advanced_config_check.mjs`.

### 2. Signatures

- `GET /api/config`: returns non-sensitive `ConfigStatus` and must remain usable by unauthenticated status chips.
- `GET /api/config?advanced=1`: requires `requireWorkspaceAccount(request)` and `isWorkspaceAdmin(account)`, returns `{ status: ConfigStatus, advanced: AdvancedConfigSnapshot }`.
- `PATCH /api/config`: requires admin role, accepts `{ values: Record<string, string | number | boolean | null> }`, and returns `{ status, advanced }`.

### 3. Contracts

- Secret fields use `kind: "secret"` in `src/lib/config.ts` and return only `configured: boolean`; `value` must be `undefined`.
- Writable keys must be present in the allow-list built from `advancedConfigGroups`; unknown keys are rejected.
- `null` patch values mean clear/remove the environment key. Local `.env.local` writes remove cleared keys; an explicit `FLUXPOST_CONFIG_FILE` retains empty tombstones so inherited base values stay cleared after restart.
- Successful writes update the selected environment file, update `process.env` for the current process, and call `reloadAppConfig()`.
- Docker production sets `FLUXPOST_CONFIG_FILE=/app/config/.env.local`, mounts the `fluxpost-config` named volume at `/app/config`, and loads persisted overrides before `appConfig` initialization. Persisted values take precedence over `deploy/env.production` base values.

### 4. Validation & Error Matrix

- Missing sign-in -> HTTP 401.
- Signed-in non-admin -> HTTP 403.
- Unknown config key -> HTTP 400.
- Invalid number/select/boolean payload -> HTTP 400.
- Plain `GET /api/config` -> no secret values and no advanced metadata.

### 5. Good/Base/Bad Cases

- Good: admin overwrites `OPENAI_IMAGE_MODEL`; the UI receives the new non-secret value and status refreshes.
- Base: admin opens a configured secret such as `OPENAI_API_KEY`; UI shows "configured" and an empty password input.
- Bad: operator calls `PATCH /api/config`; route returns 403 and does not write the selected environment file.

### 6. Tests Required

- `.trellis/verification/advanced_config_check.mjs` must assert plain status compatibility, admin-only advanced read/write, secret masking, allow-list rejection, admin-only navigation, persistent Compose mounting, pre-initialization override loading, clear tombstones, and mount-point ownership.
- Full baseline must include the advanced config check before lint/type-check/build.

### 7. Wrong vs Correct

#### Wrong

```typescript
return NextResponse.json(process.env);
```

#### Correct

```typescript
return NextResponse.json({ status: getConfigStatus(), advanced: getAdvancedConfigSnapshot() });
```

## Scenario: Feishu CLI Application Identity

### 1. Scope / Trigger
- Trigger: any publish, import, field-option, notification, or distribution path invokes `lark-cli` as bot.

### 2. Signatures
- Advanced keys: `FEISHU_APP_ID`, secret `FEISHU_APP_SECRET`, and `FEISHU_BRAND=feishu|lark`.
- Init command: `lark-cli config init --app-id <id> --app-secret-stdin --brand <brand>`.

### 3. Contracts
- `ensureConfiguredFeishuCliIdentity(...)` must run before every application-owned CLI path; its fingerprint cache performs one idempotent init per process/credential set and serializes concurrent callers.
- Secret travels only through child stdin. Advanced reads expose configured state only; `fluxpost-config` stores env overrides and `fluxpost-node-home` stores CLI state.

### 4. Validation & Error Matrix
- Missing App ID/Secret -> `needs_config` for publishing or an explicit config error before other CLI work.
- Init failure -> sanitized error; requested Base/IM command does not run. Changed fingerprint -> reinitialize.

### 5. Good/Base/Bad Cases
- Good: a new VPS receives credentials through `/config`; first publish initializes CLI and writes Base records.
- Base: later calls reuse the successful fingerprint. Bad: App Secret appears in argv, API output, or logs.

### 6. Tests Required
- `.trellis/verification/feishu_cli_identity_check.mjs` covers missing fields, stdin argv shape, caching, rotation, concurrency, retry, redaction, all CLI paths, and both persistent volumes without live Feishu calls.

### 7. Wrong vs Correct
- Wrong: `lark-cli config init --app-secret <secret>`.
- Correct: use `--app-secret-stdin`, write the secret to stdin, and sanitize subprocess failures.

## Scenario: Durable Batched Feishu Publishing

### 1. Scope / Trigger
- Trigger: manual review publishing or an automatic simple run submits one or more generated posts to Feishu.

### 2. Signatures
- `POST /api/publish/feishu` accepts `{ postIds: string[] }` and returns one persisted `FeishuPublishJob` with HTTP `202`.
- Job `progress` and structured per-post `result.itemFailures` remain in the existing queue `data_json`; no schema migration is required.

### 3. Contracts
- The API performs one owner-scoped bulk post read and durable enqueue only. Tag enrichment, vehicle lookup, approval/source updates, media preparation, Base writes, and notifications belong to the worker.
- Before the first external write, the worker must finish tag/vehicle validation and serially persist every prepared local post with the bounded transient-database retry policy.
- Every Feishu source uses ordered chunks of at most 10 posts. A settled chunk persists known record ids, verification and attachment state, item failures, and aggregate progress before the next chunk starts.
- Per-post validation/media/record/attachment failures do not block valid siblings. Chunk errors do not block later chunks; unknown create outcomes remain `retrySafe=false` and are not automatically replayed.
- One logical Job produces one terminal aggregate result and at most one summary notification. Known record ids and completed attachment uploads are authoritative on an explicit later retry.

### 4. Validation & Error Matrix
- All posts fail local validation or media preflight -> create zero Base records and preserve every failed post as `approved` with an actionable stage/error.
- Record create times out with no returned id -> mark affected outcomes unsafe to retry automatically, persist the failed chunk, and continue later chunks.
- A create response exposes only some record ids -> persist and reuse those ids; only posts without known ids retain unknown outcomes.
- Local preparation persistence fails -> stop before any external write. Chunk-result persistence fails -> stop before starting another chunk.

### 5. Good/Base/Bad Cases
- Good: 50 posts create one Job, five internal chunks, durable progress after every chunk, and one final notification.
- Base: 11 posts create two chunks; one invalid vehicle remains approved while valid posts publish.
- Bad: the route invokes Feishu CLI, 50 posts become five Jobs/notifications, or an expired worker lease automatically replays an ambiguous record create.

### 6. Tests Required
- `feishu_publish_batch_check.mjs` covers 1/10/11/50/51 boundaries, third-chunk failure continuation, durable known-id snapshots, and one notification.
- Queue, resume, media-recovery, vehicle-option, workspace-account, simple-queue, and review checks cover enqueue boundaries, ownership, local preparation ordering, retry safety, active-Job restoration, and progress without live Feishu calls.

### 7. Wrong vs Correct
- Wrong: prepare 50 posts and invoke Feishu from the request before a durable queue row exists.
- Correct: save one Job, return `202`, prepare local state serially in the worker, then publish in durable 10-post chunks.

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
- Do not reintroduce JSON file read/write stores for content pool, generated posts, batch jobs, the retired local material library, execution logs, crawl jobs, simple runs, or runtime posts.
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

- Confirmed entries are `npm run local` for the loopback port-3001 candidate, `npm run local:lan` for the same candidate on the LAN, `npm run build`/`npm run start` as internal production-mode primitives, and `npm run local:parity` for the final equality check.
- Port `3001` is the only local application environment and runs only the committed candidate; candidate restart must refuse a dirty worktree and use its current full HEAD without creating a mirror worktree or state file.
- Candidate preparation must install locked dependencies before activation. Candidate restart builds before stopping the existing listener, injects `FLUXPOST_RUNTIME_MODE=candidate` plus the full SHA, and verifies `/api/version` and HTTP behavior. It selects configuration by path and never copies configuration or runtime data.
- Keep standalone output opt-in through `FLUXPOST_STANDALONE_BUILD=1` for Docker builds. Default local builds must remain compatible with `next start` without creating `.next/standalone`, and standalone tracing must not package runtime data, generated media, crawled media, or test artifacts.
- The candidate uses normal background-worker behavior on both loopback and LAN bindings. Only isolated deterministic smoke servers may disable workers on their private test ports.

### Scenario: Single Candidate Promotion

1. **Scope / Trigger**: Any code release tested locally and promoted to production.
2. **Signatures**: `npm run local`; optional `npm run local:lan`; `npm run local:parity`; `verify-candidate.sh --ref <40-hex>`; `deploy.sh --ref <40-hex>`; `GET /api/version`.
3. **Contracts**: Port `3001` runs clean HEAD as mode `candidate`; production runs the same SHA as mode `production`; the endpoint returns only `commit`, `mode`, and `versioned`; data, media, volumes, credentials, and configuration never move with code.
4. **Validation / Errors**: Dirty local tree -> restart/parity fail; missing or malformed candidate/production SHA -> identity fails; local/runtime/GitHub/production mismatch -> parity fails; first rollout from a pre-identity wrapper with an empty container SHA -> rerun the updated wrapper for the same SHA and recheck identity.
5. **Cases**: Good = all four identities equal and loopback/LAN entries use the same candidate implementation; bad = unversioned port-3001 runtime, branch-name deploy, dirty candidate, or copying `.env*`/runtime state.
6. **Tests Required**: Runtime/parity and VPS deployment contract checks, complete deterministic baseline, real `3001` smoke, isolated VPS verifier, production identity/health/schema/volume/service/log/rollback checks, then `local:parity`.
7. **Wrong / Correct**: Wrong: push before local candidate proof or accept `/api/config` health alone. Correct: test clean HEAD, push/deploy the unchanged full SHA, and require `/api/version` equality.
- GitHub-driven Ubuntu production is owned by `scripts/deploy/vps-bootstrap.sh`, `scripts/deploy/vps-deploy.sh`, `scripts/deploy/vps-enable-domain.sh`, root `compose.yaml`, and `docs/deployment/ubuntu-docker.md`; do not add a second server layout or competing update script.
- New pre-domain installs must keep the app on `127.0.0.1:${FLUXPOST_APP_PORT:-3101}`, start only `postgres app`, and use SSH tunneling. Caddy ports 80/443 start only when `FLUXPOST_PROXY_ENABLED=true` and `FLUXPOST_PUBLIC_HOST` is a validated DNS hostname.
- Deployment code may read only explicit deployment controls from `shared/env.production`; it must not source the file as shell code. The file is root-only mode `0600`, while admin UI overrides remain in the `fluxpost-config` volume.
- Routine install, deploy, domain, diagnostic, and rollback commands must preserve all named volumes. Never add `docker compose down -v` or an equivalent volume deletion path.
- Bootstrap must not change SSH daemon settings, host firewall rules, cloud security groups, or DNS. Those are operator/provider boundaries.
- Do not add a new deployment path, process manager, service file, or server target without updating `project_brief.md`, `decisions.md`, `verification.md`, and `handoff.md`.
- Local Windows plus `38.76.210.136` is the supported fix path. After local verification and operator approval, deploy an exact full SHA directly to 38 with the installed wrapper; 82 and 104 are retired FluxPost targets and must not be reintroduced as promotion gates.
- Production candidates must preserve bootstrap v3, retention-aware deploy wrapper v4, verifier v1, the shared `.operation.lock`, and the Docker `verification` target. The verifier and deploy wrapper may preserve newer installed wrapper versions, but candidate source and deterministic checks must never downgrade the installed production wrapper.

## Scenario: Direct Fixed-SHA Deployment To 38

### 1. Scope / Trigger

- Applies to bug fixes and release activation on the sole remote FluxPost target, `38.76.210.136`.

### 2. Signatures

- Isolated candidate verification: `/opt/fluxpost-studio/bin/verify-candidate.sh --ref <full-sha>`.
- Deploy: `/opt/fluxpost-studio/bin/deploy.sh --ref <approved-full-sha>`.
- Rollback: `/opt/fluxpost-studio/bin/deploy.sh --rollback <release-id>`.
- Image-retention preview/apply: `/opt/fluxpost-studio/bin/deploy.sh --cleanup-images --check` then `/opt/fluxpost-studio/bin/deploy.sh --cleanup-images`.
- Weekly cache service: `/usr/bin/docker builder prune -af --filter until=168h` through `fluxpost-builder-prune.timer`.
- Fresh-host bootstrap remains `vps-bootstrap.sh --admin-user <user> --ref <sha>` and is not the routine 38 update path.

### 3. Contracts

- The requested ref resolves to a 40-hex commit; `release.manifest` records `commit=<sha>` and `image=fluxpost-app:<sha>`.
- Local deterministic verification and isolated VPS candidate verification precede explicit operator approval and remote deploy; no 104 staging approval or branch is required.
- Candidate verification builds `Dockerfile` target `verification` from a clean Git archive, writes a commit-bound success manifest only after the offline baseline passes, and must not read `env.production`, mount runtime volumes, or activate services.
- Successful normal deploy switches `current`, then removes unused `fluxpost-verification:*`, unreferenced historical `fluxpost-app:<40-hex-sha>`, and `rescue-*` tags older than the newest two. Rescue retention must include legacy non-timestamp tags and rank tags by Docker `CreatedAt`; `latest`, all container-referenced image ids, unknown tags, volumes, and unrelated Docker objects remain untouched. Docker image ids must be listed with `--no-trunc` before comparison with `docker inspect ... {{.Image}}`.
- Build or health failure runs no image cleanup or timer installation. Post-activation maintenance failure returns nonzero while leaving the healthy release active. Missing immutable rollback tags are rebuilt from retained release directories by the existing rollback path.
- The root-owned persistent weekly timer prunes only unused BuildKit cache older than 168 hours. Successful deploys and applied standalone cleanups install it; cleanup preview remains non-mutating. It never performs a global image/system/volume prune and does not run immediately during deploy.
- 38 preserves all named volumes, keeps app port 3101 loopback-only, and uses host Nginx for `https://flux.lightmoment.net`; FluxPost Caddy remains disabled there.
- Older app commits must not replace newer installed deploy wrappers. Production secrets, runtime data, media, and volumes are never copied to another host.

### 4. Validation & Error Matrix

- Bad or non-resolving ref -> exit before release/build.
- Windows PowerShell multi-line SSH input adds a carriage return to the ref -> the wrapper rejects the ref before mutation; rerun `--check --ref` and pass the approved 40-hex SHA as a direct remote command or transmit an explicitly UTF-8/base64-encoded LF script.
- Local baseline failure or missing operator approval -> do not start the remote deploy.
- Missing Docker `verification` target, verifier build failure, or verifier/deploy lock contention -> do not write a passing verification manifest and do not deploy.
- Failed 38 app/PostgreSQL/public health -> restore the prior manifest/image and keep all volumes.
- Docker image/container inventory failure -> refuse cleanup before any removal.
- Referenced old verification/app/rescue image -> report `skip_referenced` and retain it as a temporary safety exception.
- Image removal or systemd timer installation failure after health success -> keep the new release active, report partial maintenance failure, and exit nonzero.
- Full bootstrap on 38's existing Ubuntu 22.04 host -> reject; use the installed deploy wrapper.

### 5. Good/Base/Bad Cases

- Good: verify the clean full SHA, deploy it to 38, then retain current plus two rescue images while unused verification/history tags are removed and the weekly cache timer is active.
- Base: `deploy.sh --cleanup-images --check` reports exact keep/skip/remove choices without Docker or systemd mutation; an applied standalone cleanup also installs the weekly timer, while an approved deploy preserves volumes and automatic rollback.
- Bad: accept a pre-v4 deploy wrapper, compare truncated `docker image ls` ids with full inspect ids, force image removal, global-prune Docker, delete storage files directly, or clean after a failed health check.

### 6. Tests Required

- Automated: deploy wrapper v4/bootstrap v3/verifier v1, lock, clean-archive verification, full-id cleanup selection, dry-run immutability, referenced-image protection, success/failure ordering, timer units, ref/manifest/rollback/domain/memory/shell/destructive guards in `vps_deployment_check.mjs`, plus the full Trellis baseline.
- Live: preview selections before apply; direct-command `--check --ref` equality on Windows; release/manifest/image SHA equality; app/PostgreSQL health; loopback 3101; `https://flux.lightmoment.net` HTTP 200; Nginx/Open WebUI; unchanged named volumes; current plus two rescue images; no unused verification tags; and an active weekly timer.

### 7. Wrong vs Correct

#### Wrong

```bash
ssh root@104.243.21.233 /opt/fluxpost-studio/bin/deploy.sh
ssh root@38.76.210.136 /opt/fluxpost-studio/bin/deploy.sh
docker system prune -af --volumes
```

#### Correct

```bash
ssh root@38.76.210.136 "/opt/fluxpost-studio/bin/verify-candidate.sh --ref $APPROVED_FULL_SHA"
ssh root@38.76.210.136 "/opt/fluxpost-studio/bin/deploy.sh --ref $APPROVED_FULL_SHA"
ssh root@38.76.210.136 "/opt/fluxpost-studio/bin/deploy.sh --cleanup-images --check"
```

## Scenario: Local And Docker Next Build Output

### 1. Scope / Trigger

- Applies when changing `next.config.ts`, `Dockerfile`, local build scripts, or Docker runner copies involving `.next/standalone`.

### 2. Signatures

- Local: `npm run local` (or `npm run local:lan` for the same LAN-bound candidate); `npm run build` and `npm run start` remain internal primitives.
- Docker builder: `FLUXPOST_STANDALONE_BUILD=1 npm run build`.
- Build-time environment key: optional `FLUXPOST_STANDALONE_BUILD`; only exact value `1` enables standalone output.

### 3. Contracts

- Default local config has `output === undefined` and must not create `.next/standalone`.
- Docker config has `output === "standalone"`; runner continues copying `/app/.next/standalone` and executing `server.js`.
- `outputFileTracingExcludes["*"]` contains `public/generated/**/*`, `public/media/**/*`, `data/**/*`, and `test-artifacts/**/*`.
- Source-controlled static assets outside those paths remain eligible for Docker's explicit `COPY --from=builder /app/public ./public`.
- Production runtime data/media are supplied through existing named volumes, not the standalone bundle.

### 4. Validation & Error Matrix

- Local config returns `standalone` -> fail: local build would duplicate runtime media and local environment files.
- Docker builder omits `FLUXPOST_STANDALONE_BUILD=1` -> fail: runner-stage standalone copy has no source.
- Any runtime exclusion is missing -> fail: a local Docker-mode build can copy large mutable runtime stores.
- Docker-mode build lacks `server.js` -> fail: the production container cannot start.
- Default build creates `.next/standalone` -> fail: local output-mode isolation regressed.

### 5. Good/Base/Bad Cases

- Good: Docker mode produces a small standalone bundle with `server.js` and without runtime media/data directories.
- Base: default local build produces standard `.next/server` output and starts through `next start`.
- Bad: unconditional `output: "standalone"` traces the local 20+ GB runtime media store into `.next/standalone`.

### 6. Tests Required

- `.trellis/verification/local_build_output_check.mjs` evaluates default and Docker config modes, asserts all exclusions, and verifies Docker builder wiring.
- Full baseline must run a default build plus `next start` HTTP smoke.
- Deployment-affecting changes must run a Docker-mode build or equivalent isolated image build and assert `server.js` exists while excluded runtime paths do not.

### 7. Wrong vs Correct

#### Wrong

```typescript
const nextConfig: NextConfig = { output: "standalone" };
```

#### Correct

```typescript
const standaloneBuild = process.env.FLUXPOST_STANDALONE_BUILD === "1";
const nextConfig: NextConfig = {
  output: standaloneBuild ? "standalone" : undefined,
  outputFileTracingExcludes: {
    "*": ["public/generated/**/*", "public/media/**/*", "data/**/*", "test-artifacts/**/*"],
  },
};
```

## Scenario: Volcengine TOS Runtime Media Storage

### 1. Scope / Trigger

- Applies when changing runtime image/video/frame production, media consumers that require local files, advanced TOS configuration, pending-upload reconciliation, or the `38.76.210.136` deployment.
- Historical local URLs and administrator-managed external material directories stay outside this migration; the storage backend is selected only when a new runtime media file is persisted.

### 2. Signatures

- `persistRuntimeMedia({ filePath, publicPath, contentType?, overwrite? }): Promise<string>` persists a staged file and returns either the existing local public path or an absolute TOS URL.
- `findExistingRuntimeMedia(publicPath): Promise<string | undefined>` reuses a verified same-key/same-length object when TOS is enabled.
- `materializeRuntimeMedia(url, { maxBytes, kind, timeoutMs? }): Promise<{ filePath, resolvedUrl, temporary, cleanup }>` resolves local app media, exact TOS mirrors, or HTTP(S) media for file-only consumers.
- Missing app-managed `/media/` or `/generated/` files must resolve only through the exact logical object key via `findExistingRuntimeMedia`; successful recovery returns the canonical TOS URL so durable consumers can replace stale local references before external writes.
- `POST /api/config/tos-check` is admin-only and returns `TosStorageProbeResult` after upload, HEAD, anonymous GET, Range, and cleanup checks.
- `POST /api/config/tos-reconcile` is admin-only and returns `{ uploaded: number, failed: number, errors: string[] }`.
- `GET /api/config` adds only `tosConfigured: boolean` and `tosEnabled: boolean`; advanced `PATCH /api/config` accepts only the allow-listed TOS keys.

### 3. Contracts

- Config keys are `TOS_ENABLED`, `TOS_ACCESS_KEY_ID`, `TOS_ACCESS_KEY_SECRET`, `TOS_BUCKET`, `TOS_ENDPOINT`, `TOS_REGION`, `TOS_PUBLIC_BASE_URL`, and `TOS_OBJECT_PREFIX`. AK/SK are `kind: "secret"` and never returned as values or logged.
- `TOS_ENABLED=false` preserves the complete local-storage path. Enabling TOS requires all credential, bucket, endpoint, region, and public-base fields; the deployment prefix is `fluxpost/flux-lightmoment` and region is `cn-guangzhou`.
- Object keys are `<normalized-prefix>/<logical-public-path>`. Successful URLs use the configured HTTPS public base and append the normalized HEAD ETag as `?v=`.
- Uploads use object-level `public-read`, at most three application attempts, and SDK retries disabled. A successful PUT is not accepted until HEAD reports the expected length and a non-empty ETag.
- Upload success deletes the staged file. Final failure moves it to `data/tos-pending/<object-key>`, records only redacted diagnostics, throws, and must not persist an unverified business URL.
- Reconciliation is idempotent: it uploads pending keys without overwrite, deletes successfully verified pending files, reports failures, and does not alter the original business task state.
- Video processing materializes the complete source on the VPS before frame extraction/transcription; only the source video and selected final frames are persisted. Temporary HTTP downloads, intermediate frames, audio, and Feishu attachment copies must be cleaned in `finally` paths.
- `GeneratedPost.imageUrls`, `videoUrls`, `downloadedImages`, `downloadedVideoUrl`, and frame URLs remain strings and may contain either historical relative URLs or absolute TOS HTTP(S) URLs.

### 4. Validation & Error Matrix

- Enabled with incomplete TOS config -> fail explicitly before upload; do not fall back to local storage.
- Empty staged file, unsafe path segment, empty bucket/key, invalid public base -> fail before writing a business URL.
- PUT transport error, HTTP 408/429/5xx, or retryable network error -> retry up to the bounded attempt count; retain pending file after exhaustion.
- HEAD missing length/ETag or length mismatch -> treat upload as failed and retain pending file.
- Existing object has the expected length and overwrite is false -> reuse its ETag URL without PUT; force refresh sets overwrite true.
- Media materialization receives unsupported non-local/non-HTTP input, non-2xx response, empty body, or a byte-limit violation -> fail and remove any temporary directory.
- Feishu attachment preflight is per post: persist exact TOS repairs before CLI writes, exclude unrecoverable posts from Base record creation, publish valid posts, and keep failed posts approved with structured media errors.
- Missing sign-in on TOS admin routes -> HTTP 401; signed-in non-admin -> HTTP 403; failed live probe -> HTTP 502 with boolean cleanup status and no credentials.

### 5. Good/Base/Bad Cases

- Good: a newly generated image uploads, HEAD length and ETag match, the local staging file is removed, and the post stores `https://<public-base>/fluxpost/flux-lightmoment/generated/...?...`.
- Base: `TOS_ENABLED=false`; the same producer returns `/generated/...` or `/media/...`, preserving historical behavior and local consumers.
- Bad: TOS upload fails and code silently returns the local URL or deletes the only staged copy; the correct behavior is to retain it under `data/tos-pending` and fail the operation.

### 6. Tests Required

- `.trellis/verification/tos_runtime_media_check.mjs` must assert disabled behavior, key/URL mapping, managed-cache recognition, retries, same-size reuse, overwrite, HEAD mismatch failure, pending retention, successful cleanup, producer/consumer wiring, route authorization, and secret masking.
- Advanced-config checks must assert all eight keys are allow-listed while AK/SK values never appear in public or advanced responses.
- The default baseline remains offline. A manual live probe may use isolated credentials to assert PUT, HEAD, anonymous GET, video Range `206`, and DELETE without retaining or printing secrets.
- Deployment verification must prove `NODE_TLS_REJECT_UNAUTHORIZED` is unset, start disabled, pass the admin probe before enabling, and preserve historical local media plus unrelated VPS services.

### 7. Wrong vs Correct

#### Wrong

```typescript
try {
  return await uploadToTos(filePath);
} catch {
  return publicPath;
}
```

#### Correct

```typescript
const url = await persistRuntimeMedia({ filePath, publicPath, contentType });
// The helper returns a verified URL or throws after retaining the staged file.
return url;
```

## Scenario: ToAPIs GPT-Image-2 Async Generation

### 1. Scope / Trigger

- Applies when `OPENAI_IMAGE_API_DIALECT=toapis`, or `auto` resolves a primary/backup route host under `toapis.com`.

### 2. Signatures

- Submit: `POST /v1/images/generations` for text and reference generation.
- Upload local reference: `POST /v1/uploads/images` multipart field `file` plus `purpose=generation`.
- Query accepted task: `GET /v1/images/generations/{task_id}`.
- Env: `OPENAI_IMAGE_API_DIALECT=auto|openai|toapis`.

### 3. Contracts

- Submit JSON uses `model`, `prompt`, `n: 1..10`, documented ratio `size`, `resolution: 1k|2k|4k`, `quality`, `output_format`, `response_format: url`, optional JPEG `output_compression`, and up to 16 ordered URL-only `image_urls`.
- Pixel presets map in `src/lib/toapis-image-api.ts`; unknown custom sizes fail before submission. Historical `1200x1600` maps to `3:4`/`1k`.
- Public TOS/HTTP references pass directly. Local references upload first; generation endpoints never receive base64.
- Submission returns a task id. Non-Canvas callers retain foreground polling with at least five seconds of jitter and `Retry-After`; Canvas persists the accepted id/route/status, returns pending immediately for non-terminal acceptance, and requeues the run after 30 seconds. A resumed Canvas attempt queries immediately, then releases the image slot again when the provider remains non-terminal. Completed `result.data[].url` values are downloaded into `persistRuntimeMedia` before the 24-hour provider URL expires.
- Shared remote image work uses `runWithConcurrencyPool("image", ...)`; `WORKER_IMAGE_CONCURRENCY` defaults to 100 and is hard-capped at the provider-confirmed 100 tasks. Ready nodes inside one DAG run use `Promise.all`; separate runs are claimed durably and submit without holding slots for long polling.

### 4. Validation & Error Matrix

- Missing task id, unknown status, completed task without URL, unsupported size, or invalid upload envelope -> hard error.
- `model_not_found` or `no available channel` -> may fail over before task acceptance, but must never return a source image as completed generation.
- Accepted task status `pending`/`queued`/`in_progress` is non-terminal; query `429`/`500`-`504`/network error retries the same task. Do not create a duplicate paid task on the backup route.
- Terminal `completed`/`failed` acceptance responses remain terminal and are never converted to pending. Canvas non-terminal acceptance or resumed non-terminal status -> running node/run plus delayed requeue; non-Canvas overall timeout -> provider timeout without resubmission.

### 5. Good/Base/Bad Cases

- Good: 100 ready Canvas image nodes may submit through the 100-slot pool; every accepted non-terminal task persists its id and releases its slot while ToAPIs continues processing concurrently.
- Good: ToAPIs completes, FluxPost downloads the temporary URL, TOS verifies the object, and the post stores the durable TOS URL.
- Base: a non-ToAPIs relay under `auto` keeps the existing OpenAI JSON generations and multipart edits contract.
- Bad: ToAPIs returns `queued`, code holds the image slot for 180 seconds, reads `data[].url` immediately, or a status-query timeout submits a second paid task.

### 6. Tests Required

- `.trellis/verification/toapis_image_api_check.mjs` executes size/body/task/error helpers and asserts upload, submit, immediate Canvas handoff, immediate resumed query, retry, persistence, terminal-status handling, and hard-error wiring without live calls.
- `.trellis/verification/canvas_workflows_check.mjs` asserts parallel ready-node scheduling plus the image-pool default/hard cap of 100.
- Existing `image_task_fallback_check.mjs`, `gpt_image_size_request_check.mjs`, and `viral_replication_regression_check.mjs` must continue to pass.
- Live paid probes are manual: verify one text image and one public-TOS reference image become distinct durable TOS objects.

### 7. Wrong vs Correct

#### Wrong

```typescript
await fetch("/images/edits", { body: multipartReference });
```

#### Correct

```typescript
await fetch("/images/generations", {
  method: "POST",
  body: JSON.stringify({ size: "3:4", resolution: "1k", n: 1, image_urls: [publicUrl] }),
});
```

## Scenario: Image Provider Profiles And Admin Probe

### 1. Scope / Trigger

- Applies when changing image-provider request/response shapes, main/backup routing, image profile configuration, or the paid administrator probe.

### 2. Signatures

- Profiles: `openai_json | openai_sse | toapis_async`.
- Route config: `{ route, baseUrl, apiKey, model, profile }` for `primary | backup`.
- Admin probe: `POST /api/config/image-provider-check` with `{ route: "primary" | "backup" }`.

### 3. Contracts

- `OPENAI_IMAGE_API_PROFILE` and `OPENAI_IMAGE_BACKUP_API_PROFILE` independently select each route; `OPENAI_IMAGE_BACKUP_MODEL` falls back to `OPENAI_IMAGE_MODEL`.
- Without a new profile, legacy `OPENAI_IMAGE_API_DIALECT` maps `openai -> openai_sse`, `toapis -> toapis_async`, and `auto` resolves each route hostname independently.
- `openai_json` uses non-stream `/images/generations` JSON or `/images/edits` multipart and omits `stream`, `response_format`, and `input_fidelity`. `openai_sse` preserves deployed SSE behavior. `toapis_async` preserves its task/upload/status contract.
- Normal generation persists base64/temporary URL outputs through runtime media. The manual probe verifies bytes, uses only a fixed generated fixture, and removes local/TOS health artifacts.

### 4. Validation & Error Matrix

- Unknown profile or route -> explicit config/API error before provider submission.
- Content safety, invalid image/input, or unsupported official JSON size -> hard error without route failover.
- Auth, route, network, gateway, or capability failure before task acceptance -> route failover allowed.
- Asynchronous task id accepted -> polling retries the same id; terminal/timeout/protocol failure must not fail over or resubmit.
- Missing sign-in/admin role on probe -> `401`/`403`; saving config never runs a probe.

### 5. Good/Base/Bad Cases

- Good: primary `toapis_async` fails before acceptance and backup `openai_json` uses its own model/profile.
- Base: old `OPENAI_IMAGE_API_DIALECT=toapis` continues unchanged with no new profile values.
- Bad: provider returns a task id, polling times out, and FluxPost submits a second paid task to backup.

### 6. Tests Required

- `.trellis/verification/image_provider_profiles_check.mjs` asserts profile resolution, capabilities, official JSON fields, output parsing, route/model wiring, probe authorization/cleanup, and no probe-on-save wiring.
- Existing SSE, ToAPIs, size, fallback, viral, config, lint, type-check, build, and full baseline checks remain required; paid probes remain manual.

### 7. Wrong vs Correct

#### Wrong

```typescript
await submitToBackupAfterAcceptedTaskTimeout();
```

#### Correct

```typescript
throw new ImageProviderError("accepted task timed out", {
  category: "timeout",
  retryable: false,
  failoverAllowed: false,
  taskAccepted: true,
});
```

## Scenario: Infinite Canvas Workflow V1

### 1. Scope / Trigger

- Trigger: changing the owner-scoped `/canvas` editor, copy library, typed DAG execution, batch scheduling, result reuse/preview, persistence, or model/publish nodes.
- Applies to `src/instrumentation.ts`, `src/lib/copy-library.ts`, `src/lib/canvas/*`, `src/app/api/{copy-library,canvas}/**`, their pages, database tables, and verification scripts.

### 2. Signatures

- `GET|POST /api/canvas/workflows`; `GET|PATCH|DELETE /api/canvas/workflows/:id`.
- `POST /api/canvas/runs` accepts `{ workflowId, targetNodeIds?, runMode?: "with-upstream" | "isolated", confirmed?, confirmationNodeIds? }`; omission keeps `with-upstream`. `GET /api/canvas/runs?workflowId=...` returns recent runs plus durable latest-success projections; `GET|PATCH /api/canvas/runs/:id` reads/cancels/retries.
- `GET /api/canvas/runs/:runId/downloads/images?nodeRunId=<id>&index=<zero-based>` streams one frozen save-node image to the signed-in run owner/admin; callers never submit a media URL or filename.
- `POST /api/canvas/media` accepts authenticated multipart `files` and returns `{ images: [{ imageUrl, bytes, mimeType }] }`.
- `GET|POST /api/canvas/schedules`; `GET|PATCH|DELETE /api/canvas/schedules/:id`. PATCH actions are `save|preflight|resample|launch|duplicate|pause|resume|cancel|retry|accept-candidates` and carry the current revision plus action-specific ids.
- `GET|POST /api/copy-library`; `GET|PATCH|DELETE /api/copy-library/:id`. Copy entries store `title`, `body`, normalized manual `tags`, `visibility`, owner, and timestamps in `copy_library_entries` for both database backends.
- `PATCH /api/canvas/workflows/:id` updates with `{ revision }`; a stale revision raises HTTP `409`.
- PostgreSQL/SQLite tables: `canvas_workflows`, `canvas_schedules`, `canvas_runs`, `canvas_node_runs`, and `canvas_run_queue`.
- `concatenateCanvasText(config, values) -> string` joins already port-ordered text values without I/O.
- `splitCanvasText(config, value, { fallbackToBody? }) -> { head?: string; tail: string }`; executors enable fallback only for `utility.text-split@2`.
- `CanvasNode.size?: { width: number; height: number }` stores optional visual layout metadata in workflow JSON and immutable run snapshots; it does not change node versions or API route shapes.
- `CanvasPortKind = CanvasArtifactKind | "any"`; `areCanvasPortKindsCompatible(outputKind, inputKind)` accepts a typed output only when the input is the same kind or `any`.
- `createCanvasSchedulerSkeleton(graph, origin, createId?) -> CanvasGraph` appends the standard eleven-node scheduler structure and rejects a graph that already owns any scheduler role.
- `register() -> Promise<void>` in `src/instrumentation.ts` calls `kickCanvasSchedulerWorker()` and `ensureCanvasRunWorker()` for a normal Node server start.
- A terminal Canvas run with `batchContext` calls the scheduler wakeup through a dynamic `import("./scheduler")`; the run worker must not add a static scheduler import because the scheduler already imports run creation/worker APIs.

### 3. Contracts

- `CanvasGraph` stores typed nodes, typed edges, and viewport. Only registered `CanvasNodeDefinition` versions may be saved; edges use the centralized, directional port compatibility rule and the graph must be acyclic. Existing typed inputs still require an equal typed output; `any` is input-only.
- `CanvasArtifact` is a discriminated union of `text`, `images`, `videos`, `socialPost`, and `publishJobRef`; media values are object references/metadata, never embedded binary.
- `CanvasNode.executionMode` defaults to `enabled`; `bypass` requires an explicit registry input/output mapping, while `disabled` produces no output. Snapshots and the `fluxpost.canvas.nodes` clipboard envelope preserve the mode.
- `CanvasNode.size` is optional for legacy content-driven nodes. Explicit desktop resizing persists finite dimensions from `190x120` through `720x900`; workflow duplication and the version-1 `fluxpost.canvas.nodes` clipboard envelope preserve validated sizes. Size is excluded from config validation and execution fingerprints.
- Common nodes include `input.content-pool`, `input.library-images`, `utility.prompt-template`, `utility.text-split`, `model.gpt-vision`, `utility.image-select`, `utility.image-transform`, and `utility.video-frames`. Their config remains flat scalars/string arrays, and they reuse existing artifact kinds without schema migration.
- `utility.text-concatenate@1` is the "文本拼接" definition. It has optional single-connection text inputs `text_a` through `text_d`, processed in that fixed order, and one `text` output. Config is `{ delimiter: string, clean_whitespace: boolean }`, defaulting to `{ delimiter: ", ", clean_whitespace: false }`; literal `\\n` and an actual newline both normalize to one newline delimiter. The executor ignores empty strings, trims each input before filtering only when cleanup is enabled, preserves whitespace-only values when cleanup is disabled, and returns a successful empty text artifact when no valid input remains. It has no bypass mapping, capability, API, schema, migration, provider call, or external write.
- `utility.text-split@2` is the latest “文本分割” definition. It preserves input `text` and outputs `head`/`tail`, whose UI labels are “标题”/“正文”. Config is `{ mode: "first-line" | "delimiter", delimiter: string, delimiterIndex: positive integer }`, defaulting to `{ mode: "first-line", delimiter: "---", delimiterIndex: 1 }`; first-line mode ignores and hides delimiter fields. Editable V1 nodes upgrade on save/duplicate, while immutable V1 snapshots remain version-resolvable.
- Delimiter mode finds the configured 1-based, exact, case-sensitive, non-overlapping occurrence from left to right, removes that boundary, and trims both outputs without changing body-internal paragraphs. V2 emits only `tail` with the trimmed original text when the boundary is absent or either side is empty; it never emits an empty `head` artifact. V1 keeps strict failure semantics.
- Content-pool/library inputs execute only stored selection-time snapshots. Explicit inspector refresh replaces the flat snapshot; ordinary runs never read live content/library services. Prompt and selection nodes preserve incoming edge/item order.
- `input.copy-library@1` freezes `entryId`, display title, title/body/tag snapshots, and `snapshotAt`; its literal executor returns independent `title:text` and `body:text` outputs without database access. Private entries are owner/admin readable, team entries are member-readable, and only owner/admin may edit or delete.
- GPT vision accepts 1-8 prepared images, uses the configured Responses/Chat text endpoint plus the `gpt` pool, declares `text_model`, and maps missing text configuration to `needs_config`. Image transformation accepts 20 images at 30 MB each; video frames accept 4 videos/20 total frames and persist content-addressed URL/dimension metadata through runtime media.
- `model.gpt-vision@1` treats non-empty text connected to `instruction` as the complete model prompt: it trims and joins multiple incoming text artifacts in edge order, then sends only that user text without the analysis preset or node-level default instruction. When no effective user text is connected, the existing preset plus optional node instruction remains the backward-compatible fallback.
- `compose.social-post@1` accepts optional single text input `vehicle`, trims it into `GeneratedPost.feishuVehicle`, and no longer exposes vehicle as new-node config. Connected text takes precedence; persisted `config.vehicle` remains a read-only fallback for historical nodes.
- `utility.image-preview` copies URL/metadata-only image artifacts into node runs. Direct sinks run passively after an included image producer; failed, cancelled, blocked, or empty attempts never replace the last output-bearing success. Durable lookup joins all workflow runs rather than scanning the recent-run limit.
- `utility.display-any@1` is an outputless passive sink with one required, single-connection `value:any` input. Its executor requires exactly one upstream `CanvasArtifact` and clones it to the non-connectable `nodeRun.outputs.preview`; the node UI renders all five existing artifact kinds and uses the ordinary input fingerprint for reuse. It adds no capability or confirmation.
- `utility.save-images@1` is an outputless, non-bypassable passive sink with one required, multi-connection `images` input and config `{ filenamePrefix: string }`, default `FluxPost`. Its executor clones 1-30 ordered image references into non-connectable `nodeRun.outputs.downloads`; it creates no artifact kind, table, ZIP/TXT, permanent media copy, automatic download, provider capability, or external write. The desktop UI serially fetches current or latest-success results, releases each Blob URL after the click, continues after per-image failure, and synchronously guards duplicate batches. A completed/partial V2 batch main task with `mainRunId` exposes an explicit result-panel download command; the client loads that owner-visible immutable run, walks successful/reused save-node attempts in graph order, and reuses the same serial downloader across all matching sinks. It must surface missing-result/API errors and aggregate success/failure counts without selecting a Canvas run or triggering an automatic download.
- Save-image prefixes allow 1-80 Unicode code points but reject C0/C1 controls, `< > : " / \\ | ? *`, empty/whitespace-only values, and a trailing space or period. The route re-reads the owner-visible immutable run snapshot, requires a matching successful/reused `utility.save-images` node run, materializes only its persisted URL with a 30 MB limit, sniffs bytes through `sniffImageFormat`, and returns `<prefix>_0001.<real-extension>` with `Content-Type`, `Content-Length`, RFC 5987 `Content-Disposition`, `private, no-store`, and `nosniff`. Stream close/error/cancel cleans temporary media.
- `isolated` requires one target: literal inputs execute from current config, other ancestors reuse compatible success, and missing reuse blocks before enqueue. Ordinary compatibility covers node id/type/version/config/mode plus normalized resolved inputs; preview compatibility uses incoming-edge identity. It never silently reruns a model/write ancestor.
- Planning propagates output-port availability. Missing required input blocks only that branch; optional input does not. Confirmation includes only `execute` steps, excluding reuse/bypass/disabled/blocked. With-upstream branch blockers are non-fatal so independent branches run; isolated blockers are fatal preflight errors.
- The `/canvas` client immediately acknowledges and enqueues every successful capability plan, including billable models and `external_write`; it shows no confirmation dialog. The server still validates `confirmed` plus exact `confirmationNodeIds`, so stale or non-planned callers fail closed.
- Runs keep immutable snapshots and node attempts with `reusedFrom`; statuses include `reused`, `bypassed`, and `disabled`. Seedance persists `submit_id`/`gen_status`, requeues pending work, and queries the original id.
- GPT-Image-2 ToAPIs attempts persist `providerTaskId`, `providerTaskRoute`, and `providerStatus` through `onProviderTaskUpdate` immediately after POST acceptance. Non-terminal acceptance returns pending immediately and releases the image slot; a running attempt with an id is reused, performs one immediate status GET after its 30-second durable delay, and requeues again without reference preparation/upload or another POST. Ready DAG nodes use `Promise.all`, bounded by the shared image pool default/hard cap of 100. Expired local leases recover only for persisted-id attempts, and `GET /api/canvas/runs` wakes recovery after a Windows process restart.
- Handles stay row-relative. Desktop picker, clipboard, and local-file drop image import all use authenticated `/api/canvas/media` -> `persistRuntimeMedia` and store URL references only; they never create `library_assets`. A drop on blank/non-image canvas creates one `input.images` node at the Flow-converted pointer position, while a drop on `input.images` or `model.gpt-image@2` appends to its matching URL config. Previews use `contain` and natural/artifact dimensions. Theme variables, aligned source-colored edge beams, reduced-motion disabling, and native editing/clipboard behavior remain required.
- Canvas rendering enables React Flow `onlyRenderVisibleElements`. `markActiveCanvasEdges(edges, latestNodeRuns) -> FlowEdge[]` may add display-only `data.beamActive` when either endpoint's latest attempt is `queued` or `running`; `currentGraph(...)` must continue serializing only graph edge identity and ports, never this display flag.
- Every visible Canvas business edge renders one source-colored base path plus distance-bounded trail/body/core paths while the viewport is stationary. Endpoint distance keeps the body near 40-70 Canvas units and the trail near or below 110 units, while per-edge phase offsets prevent synchronized pulses. Idle edges use a 3.6-second lightweight flow style; selected or `beamActive` edges use a 1.8-second stronger filter and width. The edge projection sets both `--canvas-edge-color` and React Flow's `--xy-edge-stroke-selected` from the source-node business color so selection cannot fall back to gray. `onMoveStart`/`onMoveEnd` toggle `.canvas-stage-viewport-moving` directly on the stage DOM so pan/zoom suspends flow animation and SVG filters without per-frame React state; reduced-motion mode suppresses the flow paths but preserves the static business-colored base path.
- `canvasViewportDetail(zoom) -> "full" | "reduced" | "overview"` uses inclusive full/reduced boundaries at `0.65` and `0.35`. `syncCanvasViewportDetail(stage, zoom)` writes only a changed tier to `stage.dataset.canvasViewportDetail`; it must not add React state or graph fields. Reduced detail hides unselected rich media/results, overview hides unselected node content and unreadable chrome, and selected stationary nodes retain detail.
- Viewport movement does not override detail-tier media visibility: `.canvas-node-image-grid` and `.canvas-node-result` stay painted with stable DOM identity and resource requests throughout pan/zoom. Movement may still suspend resize controls, MiniMap paint, node shadows, node filters, and edge flow animation until `onMoveEnd`; the existing `full`/`reduced`/`overview` rules remain the only media visibility boundary, and their layout-preserving `visibility` must not change node measurements, handles, edge anchors, selection, or persisted graph geometry.
- The Canvas-scoped `.canvas-stage .react-flow__viewport { will-change: transform; }` hint must keep exactly one stable compositor layer ready for React Flow's native D3 transform updates. Do not add `will-change` per node, override the viewport `transform`, promote the layer only after `onMoveStart`, add media placeholders/remounts, or apply paint containment that can clip the infinite viewport. Browser verification must attribute the viewport-owned layer to `WillChangeTransform` while preserving node/handle geometry and media DOM identity.
- Canvas zoom uses React Flow's native wheel/trackpad/touch handling and built-in `<Controls showInteractive={false} />`, with the existing `minZoom={0.2}`. Do not add route-local easing/duration, wheel target accumulation, animation refs/timers, custom zoom Controls, or `zoomOnScroll={false}`; `onMoveStart`/`onMoveEnd` remain the single movement-class and viewport-persistence boundary.
- Editable desktop canvas supports blank-pane right-click/Tab search, typed dangling-edge insertion, ComfyUI-style run/cancel/save/select/edit shortcuts, and bounded 50-entry node/edge/viewport undo history. Editable controls isolate native keys, new edits truncate redo, workflow switches reset history, and mobile keeps structural shortcuts disabled.
- Every registered node uses `NodeResizer` on editable desktop canvas with independent width/height control. Only dimension changes with `setAttributes` become durable; passive React Flow measurements do not. Resized nodes keep header/ports fixed and scroll body content. Mobile renders persisted nodes at the compact default without resize controls or mutating stored size.
- `utility.prompt-switch@2` has required text ports `input1|input2|input3`, output `text`, and config `{ selectedInput: "1" | "2" | "3" }`. Prompt bodies exist only in the three connected `input.text` nodes. Editable V1 nodes and incoming `scene|sceneModification|scenePerson` edges upgrade together; immutable V1 run snapshots keep their legacy executor contract.
- One immutable schedule revision owns multiple batches. Each batch stores only `strategy: "input-1" | "input-2" | "input-3"` plus independent Eagle-style scene/vehicle filters; launch writes the corresponding ordinal into the frozen Switch snapshot. One scene creates one content task, with an inclusive random distinct vehicle sample. Launch revalidates assets/bindings and atomically writes the schedule plus all image runs/queue rows before workers start. At least one successful image creates one finalization run; later retry success appends candidates without rerunning text, and edited/reviewed drafts require explicit acceptance.
- A batch may add `copyFilter` in manual-id or AND-tag condition-random mode. Preflight resolves visible entries, sorts by `title ASC, id ASC`, samples one frozen snapshot per content task without replacement inside that batch, and requires the optional `copy-input` scheduler role/path. Whole-batch resampling resolves and resamples the copy pool; single-content resampling preserves its frozen copy. Launch and finalization consume task snapshots without rereading source entries.
- Content tasks finalize independently: once all image children for one content task are terminal and at least one image succeeded, its deterministic `canvas-scheduler-final-<contentTaskId>` run is created immediately without waiting for sibling content tasks, the batch, or the schedule to finish.
- Durable Canvas recovery is process-started, not route-traffic-started. Normal Node startup wakes both run and schedule workers; `FLUXPOST_DISABLE_BACKGROUND_WORKERS=1` disables only this instrumentation bootstrap for deterministic smoke servers. It does not alter enqueue, API wakeup, or persisted queue semantics.
- The standard skeleton creates three prompt nodes, one ordinal Switch, dynamically bound scene/vehicle inputs, GPT-Image-2 V2, one copy input, separate title/body GPT text nodes, and content assembly. The original five roles remain required; `copy-input` is optional for old graphs and required only when a copy pool is enabled. Each final content task therefore makes two distinct text-model calls before composition.

### 4. Validation & Error Matrix

- Missing/invalid node type, node config, port, owner, or graph cycle -> domain error/HTTP `400`.
- Missing size -> legacy default layout. Non-finite, partial, below-`190x120`, or above-`720x900` persisted size -> graph validation error/HTTP `400`; the same malformed size in a clipboard envelope invalidates the envelope.
- Member access to another owner's workflow/run -> not found behavior; admins follow existing owner access rules.
- Save-image download without a session -> HTTP `401`; missing/inaccessible run or mismatched/non-save node run -> `404`; malformed index, incomplete result, invalid frozen prefix, empty/over-30 result, out-of-range item, over-30-MB media, or unrecognized image bytes -> `400`.
- Stale workflow revision -> HTTP `409`.
- Isolated mode without exactly one target or compatible required reuse -> HTTP `400` before enqueue, identifying the blocked node.
- Missing required artifact in with-upstream -> node `blocked`; independent branches continue and the run may become `partial`. Missing optional artifacts are omitted.
- Missing or multiple `value` artifacts for `utility.display-any` -> explicit node failure; a second graph edge to its single input -> graph validation error. An `any` output connected to a typed input -> incompatible edge.
- Unsupported/empty bypass input -> validation/blocked node; disabled nodes skip execution config validation but still receive graph/port validation.
- Unconfirmed actual billable/external-write execution -> HTTP `409` with a confirmation plan; stale confirmation ids -> HTTP `400`.
- Missing Dreamina CLI/login, low credit, unsupported media/model/ratio/resolution, or high compliance risk -> `needs_config`/blocked state; never fake success or retry an accepted task with a new submission.
- Initial ToAPIs polling expiry or resumed `pending`/`queued`/`in_progress` -> node and run stay `running` and requeue; terminal provider failure -> node failure; an accepted response without a task id -> explicit provider failure.
- `NEXT_RUNTIME !== "nodejs"`, production build phase, or `FLUXPOST_DISABLE_BACKGROUND_WORKERS=1` -> instrumentation returns before importing or starting Canvas workers. Normal Node runtime without those guards -> both workers wake.
- Terminal batch child -> schedule wakeup. Dynamic scheduler import failure -> explicit server error log while the already-persisted terminal run remains terminal; process-start recovery or the next wakeup can reconcile it later.
- Missing/too many/oversized/unsupported upload files -> HTTP `400`; unsigned upload -> `401`; storage failure -> surfaced `500` with no URL added to the graph. Desktop dragover accepts image MIME items even before protected `DataTransfer.files` is readable; non-image drops and malformed clipboard envelopes are ignored, and mobile does not create structural nodes from a drop.
- Empty text-split input -> execution error in every version. Empty delimiter or non-positive/non-integer `delimiterIndex` in V2 delimiter mode -> config error. V1 absent/empty-sided boundary -> execution error; V2 absent/empty-sided boundary -> success with the complete trimmed input on `tail` only.
- Missing or non-boolean `clean_whitespace` on `utility.text-concatenate@1` -> config validation error. Missing optional text inputs and all-empty effective inputs -> successful execution with `{ text: { kind: "text", value: "" } }`; they are not graph or execution errors.
- Missing content/library snapshot, unresolved template placeholder, invalid/out-of-range image index, invalid transform dimensions/format/quality, or invalid/excess frame plan -> node validation/execution error with no partial artifact.
- Missing/duplicate scheduler roles are listed together with Chinese business labels, and the drawer requires five explicit unique node selections before preflight. Draft preflight adopts the workflow's latest saved revision, while launch still rejects any workflow/preview revision drift; missing frozen assets, insufficient distinct pools, or more than 2,000 image children also fail before atomic launch. Launched schedules are immutable and never auto-publish.
- Copy create/update with empty or oversized title/body, invalid visibility, non-array tags, more than 30 tags, or a tag over 40 characters -> HTTP `400`; unsigned access -> `401`; invisible entry -> `404`; non-owner member mutation -> `403`.
- Enabled copy pool with fewer accessible candidates than content tasks -> preflight error containing available and required counts before provider work; copies must never wrap or repeat inside one batch. Missing or wrong-type `copy-input`, or no path to `content-target` -> preflight error. A deleted source after preflight does not invalidate the already-frozen task snapshot.
- Prompt Switch input outside `1..3`, an unconnected ordinal input, or an empty connected prompt -> config/graph/execution error before provider work. Skeleton insertion with any existing scheduler role -> explicit no-op error; it never replaces or duplicates graph content.
- Missing `ffmpeg`/`ffprobe` -> `needs_config`; media command failure -> explicit node failure. Image/video helpers use allow-listed `execFile` argument arrays and never accept shell text from node config.

### 5. Good/Base/Bad Cases

- Good: isolated content assembly executes current text, reuses compatible GPT image/preview output with provenance, creates a fresh draft, and makes zero image-model calls.
- Good: a frozen content snapshot feeds a template/vision/image-selection chain, a dangling text edge creates `compose.social-post` on its selected body port, and local transforms persist bounded URL/dimension artifacts.
- Good: dragging several local images onto blank desktop canvas creates one image node at the release point; dragging onto an existing image input appends the same runtime-media URLs without adding anything to the shared library.
- Good: `A---B---C` with delimiter `---` and index `2` emits title `A---B` and body `C`; CRLF and body paragraphs remain intact after outer trimming.
- Good: text A ` first ` and text C `third` with `delimiter="\\n"` and cleanup enabled emit `first\nthird`; disconnected B/D inputs are omitted without changing A-D order.
- Good: a selected node is resized freely, autosaves `{ size: { width, height } }`, reloads and pastes at the same size, while mobile remains compact and non-resizable.
- Good: one typed output connects to “展示任何”, running that producer passively refreshes the sink, and text/image/video/social-post/publish-job results use the existing viewers without exposing a wildcard downstream port.
- Good: three text nodes contain independently editable prompts, two batches select inputs 1 and 3, and their frozen Switch snapshots use those exact ordinals while variable vehicle counts queue round-robin.
- Good: two image producers feed one save sink; the run freezes three references, and one Edge click downloads `car_0001.png`, skips a failed second response, then downloads `car_0003.png` while reporting `2` successes and `1` failure.
- Good: ToAPIs accepts up to 100 ready image tasks, each id is saved before the Canvas executor returns pending, image slots are released, and later worker GETs resume the same ids without a second paid POST.
- Good: content task A writes its review draft while sibling B is still running, and a server restart reconciles stale completed image runs without opening the Canvas schedule drawer.
- Good: five matching copy snapshots are shuffled without replacement for five content tasks; each task freezes a unique source and runs title GPT plus body GPT before `compose.social-post` creates the existing review draft.
- Base: a V2 boundary miss emits no `head` artifact and sends the original copy through `tail`; omitted execution/run modes and node size preserve legacy enabled/content-driven behavior.
- Base: text A containing only spaces remains present when cleanup is disabled; four absent or empty inputs still emit a successful empty text artifact.
- Base: a batch run completes unattended with only `outputs.downloads`; an operator later opens its latest-success result and explicitly downloads the frozen images to the browser-configured directory.
- Bad: adding `any` to `CanvasArtifactKind`, declaring a wildcard output, duplicating compatibility conditions in graph/clipboard/UI, persisting ResizeObserver measurements as user size, allowing mobile resize handles, emitting an empty title on fallback, rerunning a paid isolated ancestor, embedding Base64, passing shell strings to ffmpeg, or resubmitting accepted Seedance/ToAPIs work after timeout.
- Bad: editing prompt bodies in the scheduler, giving Switch ports semantic scene/person meanings, silently shrinking an insufficient sample, launching only valid batches, mutating a launched sample, or overwriting an edited draft when retry images arrive.
- Bad: waiting for aggregate batch completion before creating review drafts, relying on `GET /api/canvas/schedules` as the only recovery trigger, or allowing a baseline smoke server to advance real persisted work.
- Bad: wrapping a short copy pool with modulo assignment, rereading the copy library during single-content resampling or finalization, mutating saved Canvas snapshots after a source edit, treating `copy-input` as a sixth mandatory role for legacy schedules, or combining title/body into one model call in the standard skeleton.
- Bad: sorting concatenation inputs by edge creation order, treating whitespace-only text as empty while cleanup is disabled, requiring any A-D port, or adding a bypass/provider capability to the local utility.
- Bad: accepting a caller media URL, trusting a URL suffix as the image format, writing a node-configured server path, downloading automatically, buffering all 30 images together, or stopping the batch after one failed image.

### 6. Tests Required

- `canvas_workflows_check.mjs`: node-size bounds, graph/clipboard round trip, local image drag filtering/drop-target routing/Flow-coordinate import wiring, resize/mobile lockout, V1/V2 text-split, text-concatenate registration/config validation/A-D ordering/empty filtering/whitespace cleanup/newline normalization/empty success, display-any, graph/common-node/vision/media/reuse/preview/isolated execution, direct enqueue, shortcut guards, bounded history, and quick-add contracts.
- `canvas_workflows_check.mjs` plus scoped Canvas browser checks must assert visible-element culling; distance-bounded idle trail/body/core paths; selected/source-colored base paths; source-to-target offset interpolation; non-synchronized phases; movement-time flow suspension; reduced-motion suppression; detail-tier boundaries/idempotence; media visibility, DOM identity, and request stability during movement; native wheel/control zoom without a custom easing controller; pointer anchoring; and preserved node/handle/MiniMap behavior without external calls.
- `toapis_image_api_check.mjs` and `canvas_workflows_check.mjs`: accepted-id callback ordering, immediate non-terminal handoff, terminal-status preservation, immediate one-GET resume without POST/reference preparation, running-attempt reuse, provider-field round trip, expired-lease recovery, API wakeup, delayed requeue, parallel ready nodes, and image-pool cap 100.
- TypeScript, lint, build, full Trellis baseline, and local production restart must pass without paid provider calls.
- Mocked desktop/mobile browser coverage must exercise text-split inline/inspector synchronization, display-any five-kind rendering/current-failure/latest-success/history state, preview/fullscreen, modes, compatible quick-add, mobile structural lockout, and horizontal overflow. Real model/Seedance/Feishu/PostgreSQL concurrency remain operator-approved.
- `canvas_scheduler_check.mjs` plus the task browser check must cover ordinal Prompt Switch execution and V1 migration, the standard skeleton and duplicate-role guard, distinct sampling, transaction/ownership wiring, sequential autosave revisions, preflight/runtime controls, contrast, and 1440x960/390x844 overflow without live calls.
- `canvas_scheduler_check.mjs` must also assert per-content finalization inside the content loop, terminal batch-run scheduler wakeup without a static circular import, Node startup worker bootstrap, and the baseline smoke disable contract. A user-approved local restart may separately verify drafts appear while sibling tasks remain active.
- `copy_library_check.mjs` must cover both schemas, row-level helpers, authentication, visibility/edit permissions, tag normalization/AND filtering, page/navigation contracts, node registration/config validation, and literal frozen outputs. Scheduler checks must cover legacy five-role compatibility, copy binding/path enforcement, deterministic injected-random no-replacement assignment, insufficient capacity, whole-batch copy resampling, single-content snapshot preservation, final graph injection, and the two-GPT skeleton.
- `canvas_workflows_check.mjs` must cover save-node registration, passive planning, prefix validation, 1/30/31 boundaries, empty input, deep cloning, reuse, old graphs, serial UI requests, partial continuation, duplicate-click guards, Blob cleanup, and history results. `canvas_image_download_check.mjs` must cover auth/ownership, forged records/URL exclusion, indices/prefixes, local/TOS-recovered/remote materialization, true byte-sniffed extensions, response headers, size/non-image rejection, and complete/cancelled stream cleanup. Mocked Edge must verify real single/multi/history download events and filenames without external calls.

### 7. Wrong vs Correct

#### Wrong

```typescript
await executeCanvasNode(ancestor); // isolated run silently spends again
await writeFile(node.config.directory, imageBytes); // a Canvas node must not choose a server path
```

#### Correct

```typescript
await onProviderTaskUpdate({ taskId, route, status });
return resumeTaskId ? queryProviderTask(resumeTaskId) : submitProviderTask();

const outputs = { tail: { kind: "text", value: split.tail } };
if (split.head !== undefined) outputs.head = { kind: "text", value: split.head };

// Keep concatenation ordered by stable port ids, not by edge insertion order.
const values = ["text_a", "text_b", "text_c", "text_d"]
  .flatMap((port) => textValues(inputs[port]));
const text = concatenateCanvasText(node.config, values);

// Persist only an explicit NodeResizer dimension change.
if (change.type === "dimensions" && change.setAttributes && change.dimensions) {
  node.size = change.dimensions;
}

// Keep wildcard compatibility directional and outside CanvasArtifactKind.
if (!areCanvasPortKindsCompatible(output.kind, input.kind)) {
  throw new Error("Incompatible canvas ports");
}

// Freeze every child run in the same transaction; only then wake workers.
await launchCanvasScheduleInDb(schedule, expectedRevision, preparedRuns);

// Sample enough distinct copies during preflight; finalization never reads the source library.
const copies = assignCanvasScheduleCopies(copyPool, scenes.length, batch.name);
content.copy = copies[index];
finalGraph = createSchedulerFinalizationGraph(graph, bindings, imageUrls, content.copy);

// Prompt content stays in text nodes; batches freeze only an input ordinal.
switchNode.config.selectedInput = batch.strategy.slice(-1);

// Wake reconciliation after each persisted terminal batch child.
if (batchRunTerminal && batchRun?.batchContext) notifyCanvasScheduleRunTerminal(batchRun);

// Keep deterministic smoke servers from advancing real persisted work.
if (process.env.FLUXPOST_DISABLE_BACKGROUND_WORKERS === "1") return;

// Freeze references during execution; authorize and materialize one image only on a later user click.
return { outputs: { downloads: { kind: "images", items: structuredClone(items) } } };
const selected = resolveCanvasImageDownload(ownerVisibleRun, nodeRunId, index);
```

## Scenario: Canvas Clipboard And Workflow Portability

### 1. Scope / Trigger

- Trigger: changing cross-workflow node copy/paste, Canvas JSON decoding, workflow file import/export, or the compact Canvas toolbar. This format is FluxPost-owned and does not accept ComfyUI workflow JSON.

### 2. Signatures

- Clipboard: `{ kind: "fluxpost.canvas.nodes", version: 1, nodes, edges }`.
- File: `{ kind: "fluxpost.canvas.workflow", version: 1, name, graph: { nodes, edges, viewport } }`; the client imports through the existing `POST /api/canvas/workflows` with `{ name, graph }`.
- `decodeCanvasGraph(unknown) -> CanvasGraph`; `decodeCanvasGraphFragment(nodes, edges) -> Pick<CanvasGraph, "nodes" | "edges">`; graph limits are `200` nodes and `600` edges.

### 3. Contracts

- Copy stores selected nodes plus only their internal edges in a page-session memory clipboard, then attempts the system clipboard. Cut removes source nodes after the memory payload exists. Toolbar paste falls back to memory only when the system API is absent or rejects; a successful non-Canvas system read must not reuse stale memory.
- Paste creates fresh node/edge ids, anchors the fragment at the pointer or viewport center, preserves relative positions/config/size/mode/role, and applies the complete fragment atomically. A target role conflict clears only the pasted role and reports it.
- Export reads the current React edit state, including changes inside the 900 ms autosave window. Files omit workflow/user/revision/template/time/schedule/run/result metadata and embed no media bytes.
- Import accepts at most 10 MB, upgrades known node versions, validates in the browser, then relies on the existing owner-scoped service to upgrade and validate again before one revision-1 normal workflow is created and activated.

### 4. Validation & Error Matrix

- Wrong kind/file version, unknown node version, malformed config/viewport/id, missing or incompatible port, dangling edge, cycle, or graph over `200/600` -> reject before workflow POST.
- Paste whose merged graph exceeds `200/600` or whose generated ids collide -> reject the whole fragment without changing the target graph.
- Imported create failure -> show the API error and retain the current workflow; no client-side partial record exists.

### 5. Good/Base/Bad Cases

- Good: copy a connected fragment on A, switch to B with denied clipboard permission, paste from session memory, clear only conflicting pasted roles, export the unsaved edit, and import it as a new owner-scoped workflow.
- Base: an old version-1 clipboard without `schedulerRole` remains valid; file import normalizes omitted execution modes to `enabled` through the existing graph upgrade.
- Bad: fall back to stale memory after reading ordinary system text, export persisted server state instead of the visible edit, trust file identity/owner fields, or insert part of an over-limit fragment.

### 6. Tests Required

- `canvas_workflows_check.mjs` covers clipboard/file round trips, privacy projection, roles/conflicts, merged limits, filenames, upgrades, viewport/port/cycle/version rejection, and static UI wiring.
- Mocked Chromium covers A-to-B paste, denied and changed system clipboards, fresh ids/internal edges/relative positions, current-state export, legal/illegal import, activation, and 1440x960 plus 1024x768 toolbar overflow. Scheduler, TypeScript, lint, build/restart, HTTP `200/401`, and the full isolated baseline remain required.

### 7. Wrong vs Correct

#### Wrong

```typescript
const payload = await navigator.clipboard.readText().catch(() => staleMemory);
setNodes((current) => [...current, ...partialNodes]);
```

#### Correct

```typescript
const fragment = prepareCanvasClipboardPaste(currentGraph, payload, anchor, createId);
setNodes((current) => [...current.map(clearSelection), ...fragment.nodes]);
```

## Scenario: Flexible Canvas Batch Scheduling V2

### 1. Scope / Trigger

- Trigger: changing user-defined batch parameters, two-level expansion, Canvas field injection, V2 schedule APIs, main/child reconciliation, or node naming.
- V2 is a parameter layer over the existing Canvas DAG/run/queue engine. It must not create recursive task trees, a second executor, arbitrary JSON-path writes, or new database tables.

### 2. Signatures

- `CanvasScheduleV2Definition = { parameters, expansion: { main, child }, childResult, mainTargetNodeId?, aggregationPolicy }`.
- A parameter stores `id`, user `name`, `scope: "main" | "child"`, `valueType`, `source`, `expansion: "fixed" | "each" | "random"`, optional `sampleCount: { mode: "exact", value } | { mode: "range", min, max }` for random expansion, and `binding: { nodeId, fieldKey }`. Historical `randomCount` is a read-only exact-count compatibility field; newly saved/preflighted/duplicated definitions persist only `sampleCount`.
- Types are `image|image-group|text|copy|number|boolean|enum`; resolved sources are fixed/manual value arrays, library filters, or copy filters.
- `PATCH /api/canvas/schedules/:id` adds `convert-v2`; V2 `retry` requires `mainTaskId + childTaskId`, while V2 `accept-candidates` requires `mainTaskId`.
- `getCanvasBatchBindableFields(node)` is the registry-owned allow-list. `validateCanvasScheduleV2AggregateGraph(...)` validates the optional main target after child-result replacement.

### 3. Contracts

- The hierarchy is exactly schedule -> main task -> child tasks. Main parameters broadcast to every child under that main task; each vehicle angle or other child `each` value creates one independent child run.
- Cartesian and zip expansion apply independently at each level. Main random parameters sample once per preview; child random parameters resample independently for every main task. Exact or inclusive-range counts apply to every parameter type, are selected without replacement inside one parameter/main sample, and may reuse candidates across main tasks. Cartesian parameters choose counts independently; zip parameters share one uniformly selected count from the intersection of their allowed count ranges. Scalar values deduplicate by canonical value, asset/copy snapshots by stable record ID, and image groups by ordered asset IDs while remaining one structured value. The cumulative hard schedule limit is 2,000 child runs.
- Bindings persist stable `nodeId + fieldKey`; labels are display-only and may duplicate. Every Canvas node can persist a non-empty custom label of at most 80 characters, and selectors show custom label, node type, and short ID.
- Preflight resolves owner-visible source records, performs random sampling, freezes the selected values into immutable task snapshots, expands both levels, validates every child plan and optional aggregate plan, and fingerprints the definition plus task tree. Launch never samples again: it revalidates workflow revision, preview fingerprint, frozen asset visibility, binding compatibility, and then atomically writes the schedule and all child runs/queue rows. Explicitly running preflight again creates a fresh random sample.
- The expanded V2 preview renders every task-local `CanvasScheduleAssetSnapshot.url` found in frozen main/child `parameterValues`; image groups remain one frozen value but expose their ordered images through the existing bounded sequence viewer. Preview clicks never mutate the task snapshot, and the scrollable editor must retain enough clearance that the sticky launch bar cannot cover the final preview row.
- The child result must be `text`, `images`, or `videos`. Without a main target, successful child artifacts are the main result. With one, the frozen child-result node is replaced by a matching literal input and only its downstream path executes; `external_write` ancestors are forbidden.
- Default aggregation succeeds with at least one artifact-producing child; strict mode requires every child. Failed children retry independently. Image retries for an existing social-post main target preserve the original aggregate run and use the existing draft guard: unchanged drafts sync automatically, edited/reviewed drafts expose explicit candidate acceptance.
- Schedules without `schemaVersion: 2` remain V1. Conversion creates a separate V2 draft and discovers image binding keys from the registry (`urls` or `assetIds`) instead of guessing by node type.
- Duplicating either schedule version derives `<base> 副本 YYYYMMDD-HHmmss` from the source name and the duplicate's single `now` value in `Asia/Shanghai`. It removes only repeated recognized trailing old/new copy markers, preserves `副本` elsewhere, and truncates only the base portion when the complete suffix must fit the 80-character name limit.

### 4. Validation & Error Matrix

- Empty/duplicate parameter ID, empty/over-80 name, unsupported type/source/scope/expansion -> preflight HTTP `400`.
- Missing node/field, incompatible type, or two parameters bound to one field -> preflight HTTP `400` before provider work.
- Fixed parameter resolving to other than one value, empty iterated source, invalid exact/range count, range minimum above maximum, configured maximum exceeding unique candidate capacity, empty zip-count intersection, or more than 2,000 cumulative children -> preflight HTTP `400`.
- Missing/mismatched child output, blocked child/aggregate plan, main target outside the child-result downstream path, or an `external_write` ancestor -> preflight HTTP `400`.
- Workflow/preview drift or deleted/inaccessible frozen library asset -> launch rejection with no partial runs inserted.
- Retry on a non-failed/missing child or missing failed node attempt -> HTTP `400`; candidate acceptance without an existing V2 review draft -> HTTP `400`.

### 5. Good/Base/Bad Cases

- Good: one fixed person plus one fixed scene and three vehicle angles expands to one main task and three child runs, each receiving exactly one angle.
- Good: a vehicle-angle child parameter with four candidates and `sampleCount: { mode: "range", min: 2, max: 4 }` independently freezes 2-4 distinct IDs under every main task; candidates may repeat only across different main tasks.
- Good: random image and copy main parameters use zip with overlapping ranges, select one shared count from the intersection, and freeze one-to-one pairs for that preview.
- Good: two renamed `input.images` nodes keep distinct ID-based bindings after save, copy, reload, preview, and launch.
- Good: a main task with frozen person/scene images and three child vehicle snapshots displays two main thumbnails plus one thumbnail per child, and any thumbnail opens the task-local sequence without changing the preview fingerprint.
- Base: no main target returns the successful artifact set; partial aggregation marks the main task `partial` when some children fail.
- Bad: sampling with replacement inside one main task, silently shrinking an excessive maximum, sampling child parameters once and copying the same subset to every main, independently choosing incompatible zip counts, resampling at launch, rendering only image filenames in the expanded preview, covering preview rows with the sticky launch bar, adding `person`, `scene`, or `vehicleAngle` as fixed schema fields, binding by label, injecting an arbitrary config path, flattening all angles into one child, or recreating an edited review draft after retry.

### 6. Tests Required

- `canvas_scheduler_check.mjs` must cover exact/range boundaries, main-once and child-per-main sampling, Cartesian independent counts, zip range intersection, fixed/list/image-group values, deterministic random-source injection, scalar/stable-record/image-group deduplication, no source mutation, insufficient maximum capacity before preview save, cumulative 2,000-child rejection, legacy `randomCount` direct launch and duplicate normalization, copy-name suffix/time/80-character normalization, typed injection, aggregate ancestor pruning, main-target planning, conversion field discovery, social-post retry preservation, and explicit candidate acceptance.
- `canvas_workflows_check.mjs`, TypeScript, scoped lint, and production build must remain green without provider calls.
- Mocked 1440x960 and 390x844 browser checks must cover two renamed same-type nodes, ID-disambiguated binding choices, random-mode selection and an editable random-count input, a one-main/three-child preview, decoded frozen main/child thumbnails, task-local full-screen preview, both aggregation policies, and zero horizontal overflow or sticky-action overlap.

### 7. Wrong vs Correct

#### Wrong

```typescript
node.config[parameter.name] = value; // labels and arbitrary keys are not contracts
```

#### Correct

```typescript
const count = parameter.sampleCount.mode === "range"
  ? randomIntegerInRange(parameter.sampleCount.min, parameter.sampleCount.max, random)
  : parameter.sampleCount.value;
const values = sampleUniqueCanvasScheduleParameterValues(candidates, count, parameter.name, random);

const field = getCanvasBatchBindableFields(node)
  .find((candidate) => candidate.key === parameter.binding.fieldKey);
if (!field?.parameterTypes.includes(parameter.valueType)) throw new Error("Incompatible batch binding");
```

## Scenario: Batch Original Xiaohongshu Card Workspace

### 1. Scope / Trigger

- Trigger: changing `/original`, its owner-scoped APIs, `original_*` persistence, card prompt/QA catalogs, worker recovery, or structured review regeneration.
- The workflow adapts `baoyu-xhs-images` v2.0.1 commit `6b7a2e417500561a5ecdd0b168332f4142584617` as local versioned data and prompt rules. Runtime installation or invocation of the upstream Skill is forbidden; preserve the MIT attribution in `THIRD_PARTY_NOTICES.md`.

### 2. Signatures

- `POST /api/original/batches` accepts `{ items, settings }`; `{ action: "preflight", items, settings }` validates without persistence. `GET /api/original/batches?page=&pageSize=&status=` lists visible batches.
- `GET /api/original/batches/:id` returns one visible batch and ordered items. `PATCH` accepts `{ action: "pause" | "resume" | "cancel" | "retry_failed" }`.
- `POST /api/original/cards/regenerate` accepts `{ postId, cardId, prompt? }` and returns `{ post, card, pending?: true }`; `pending: true` means the accepted task will continue through the durable batch queue.
- PostgreSQL and SQLite both own additive `original_batches`, `original_batch_items`, and `original_batch_queue` tables. `WORKER_ORIGINAL_BATCH_CONCURRENCY` defaults to `2` and is capped at `8`.
- Each `XhsCard` snapshot may persist `providerTaskId`, `providerTaskRoute`, and `providerStatus` for accepted asynchronous image work.

### 3. Contracts

- A submission has 1-100 non-empty rows. Each row has `topic` 1-120 characters, optional `requirements` up to 4,000, and optional `vehicleKeyword` up to 96. Empty rows are ignored; exact duplicates are reported by one-based row number but remain valid. Any invalid row rejects the whole create before inserts.
- Batch settings choose automatic or fixed strategy/style/layout/palette and automatic or fixed 2-10 cards. Web search defaults off and can be enabled only when the text endpoint supports Responses.
- Planning and writing are separate model stages. The frozen plan and deterministic catalog assembly produce exact per-card prompts; models do not invent catalog rules. ToAPIs/SSE use 3:4, while standard OpenAI JSON uses uncropped `1024x1536` 2:3 compatibility output.
- Generate the cover without references. Cards 2-N may start only after a completed cover exists and must receive that cover as their sole style reference. QA checks expected Chinese, corruption/missing text, hierarchy, safe zones, and series consistency; one failed card gets exactly one retry from the frozen prompt, then remains as a candidate marked `needs_review`.
- `GeneratedPost.xhsSeries` is versioned and retains strategy, style, layout, palette, prompts, candidates, selected URLs, and QA. `imageUrls` is always the ordered projection of completed card URLs. Missing vehicle input uses the topic as `taskKeyword` and leaves `feishuVehicle` unset.
- PostgreSQL claims with `FOR UPDATE SKIP LOCKED`; SQLite claims atomically. Paused/cancelled batches are excluded from claims. Stage-boundary checks stop new calls, while completed in-flight results are retained.
- ToAPIs `pending`/`queued`/`in_progress` is non-terminal. Persist the task id/route/status on both the batch item and review draft before returning from the provider call, keep the card/item/batch generating, requeue the same item for 30 seconds later, and resume with the same task id without another paid POST. A pending cover leaves cards 2-N `planned` until the cover completes.
- Startup recovery atomically requeues expired original work only when an item card has a pending provider task id. Expired work without a persisted id remains ambiguous and is failed for explicit review/retry rather than replayed.

### 4. Validation & Error Matrix

- Missing session -> HTTP `401`; missing or inaccessible owner record -> HTTP `404`; unsupported action, invalid transition, invalid row/settings, unavailable requested web search, missing card, or missing cover anchor -> HTTP `400`.
- Any row error -> HTTP `400` with `{ error, rowErrors: [{ row, field, message }] }` and zero batch/item/queue inserts.
- Planning or writing failure -> only that item becomes `failed`; sibling items continue. Partial image failure after copy success -> persist one review draft with successful candidates and mark the item/batch for review or partial completion.
- Accepted provider task with id and non-terminal status -> card/item/batch stay generating and the queue polls the same id after 30 seconds. Accepted/pending response without an id -> explicit non-resumable card error; never submit a replacement automatically.
- Resumed provider task returns terminal failure -> preserve its task identity and exact provider error, then mark only that card failed/needs-review according to retained candidates. Process restart with a persisted pending id -> requeue and query; process restart without an id -> fail as ambiguous.
- Pause stops new item claims; resume requeues only non-terminal items. Cancel prevents new calls and retains completed artifacts. `retry_failed` is valid only for terminal batches with failed items and never recreates successful drafts.

### 5. Good/Base/Bad Cases

- Good: 100 pasted rows preflight atomically, show the maximum image-request budget, enqueue once, and produce independently reviewable drafts.
- Good: cover generation completes first; every later card uses the same cover URL and a failed QA card alone consumes one retry.
- Good: ToAPIs accepts the cover, the card snapshot saves its task id, the queue releases its image slot, and a later GET completes the same task before cards 2-N start.
- Base: title/body succeed and some card calls fail; one partial draft remains in `/review` with frozen prompts, candidates, QA issues, and missing-card recovery.
- Bad: marking normal ToAPIs pending as `needs_review`, failing cards 2-N while their cover is merely pending, replaying a provider request after ambiguous acceptance, using a non-cover card as a style reference, patching text onto generated images, silently dropping invalid rows, or auto-publishing to Feishu.

### 6. Tests Required

- `original_batch_workspace_check.mjs` must cover catalog counts, validation/duplicates, settings, API auth/error contracts, schemas, queue claiming, aspect mapping, review projection, task-id persistence, delayed requeue, expired-lock recovery, and homepage/workspace wiring.
- `original_card_orchestrator_mock_check.mjs` must execute the orchestrator and assert cover-first ordering, the single shared cover reference, exactly one failed-card retry, no QA-unavailable retry, pending task retention/resume, pending-cover blocking without child failure, and no automatic replay without an id.
- `review_desk_workflow_check.mjs`, concurrency/PostgreSQL checks, TypeScript, scoped lint, production build/restart, HTTP `200/401`, and mocked Chromium at 1440x960 and 390x844 must pass without external provider calls. Real two-topic/three-card and authenticated multi-user PostgreSQL tests remain explicit operator gates.

### 7. Wrong vs Correct

#### Wrong

```typescript
if (result.status === "pending") markNeedsReview(card);
```

#### Correct

```typescript
card.providerTaskId = result.providerTaskId;
await persistSeries(card);
await requeueOriginalBatchItem(item.id, 30_000);
```

## Scenario: Configurable workspace content safety policy

### 1. Scope / Trigger

- Crawl-stage content safety is a workspace policy, not an environment setting or keyword relevance filter. Administrators may configure or disable its categories, ordered local rules, model prompt/scope, and review/filter thresholds for future work.

### 2. Signatures

```typescript
getContentSafetyPolicy(): Promise<ContentSafetyPolicy>;
normalizeContentSafetyPolicySnapshot(policy?: ContentSafetyPolicy): ContentSafetyPolicy;
filterUnsafeSourceItems(items, context?, policy?): Promise<SafetyFilterResult>;
```

- `GET|PUT /api/content-safety-policy`, `POST /api/content-safety-policy/test`, and `POST /api/content-safety-policy/reset` are the browser contracts.
- The current versioned JSON document is stored in `app_meta.key="content_safety_policy_v1"`; writes use `compareAndSetAppMetaValue(...)` for PostgreSQL and SQLite without a schema migration.

### 3. Contracts

- Signed-in users may read. Only administrators may save, reset, or test. PUT/reset require `expectedRevision`; successful writes increment the revision and store sanitized actor metadata.
- Enabled local rules run in array order and stop on the first match. Groups are AND-ed; each group selects title/body/author fields and uses `any`, `all`, or `at_least`. Actions are `allow`, `review`, or `filter`.
- Local `filter` is final. Local `review` reaches the model when enabled. Local `allow` reaches it only for `model.scope="all_non_filtered"`. Master-off allows all content and never calls the model.
- Model output is validated against the immutable JSON Schema for `riskScore`, configured category ids, and reasons. Scores below review allow, scores at/above review mark review, and scores at/above filter are filtered. Unknown string category ids are dropped; malformed output is a model failure.
- Simple runs and crawl jobs persist `contentSafetyPolicy`; workers use that snapshot. Historical records without one use the shipped default. Synchronous link import reads the current policy once at request start and passes it explicitly.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Missing sign-in | `401` |
| Non-admin save/reset/test | `403` |
| Invalid ids, references, groups, sizes, prompt, or thresholds | `400` |
| Stale expected revision or failed atomic compare-and-set | `409` with current revision |
| Master or model disabled during model test | No provider call; sanitized skipped result/audit |
| Provider request, invalid JSON/schema, or invalid score | Preserve local result and record failed status |

### 5. Good/Base/Bad Cases

- Good: an exception-first `allow` rule bypasses later local rules; a model call still occurs only when scope is `all_non_filtered`.
- Base: shipped defaults filter explicit profanity/insults and repeated strong-negative terms, review one negative signal or strong competitor comparison, and use thresholds `40/80`. Note `6a52fe8300000000060235f2` enters review instead of local hard filtering.
- Bad: rereading the mutable global policy inside a queued worker changes an existing task; counting case/whitespace-equivalent terms separately can falsely satisfy `at_least`.

### 6. Tests Required

- `content_safety_policy_check.mjs` covers rule order/scopes/modes, disabled rules, custom categories, threshold boundaries, atomic persistence contracts, API permissions/statuses, reset, and sanitized audits.
- `source_safety_filter_check.mjs` covers shipped-default abuse and Xiaohongshu regressions plus provider, JSON, schema, and score fallback behavior.
- `content_safety_policy_snapshot_check.mjs` covers simple-run, crawl-job, and link-import snapshots. Mocked Chromium covers desktop/mobile editing, sorting, validation, dry-run, explicit model test, save, reset, and no automatic model call.

### 7. Wrong vs Correct

```typescript
// Wrong: a queued worker reads policy changes made after the task started.
const result = await filterUnsafeSourceItems(items);

// Correct: execution uses the policy frozen on the task.
const policy = normalizeContentSafetyPolicySnapshot(run.contentSafetyPolicy);
const result = await filterUnsafeSourceItems(items, context, policy);
```

## Scenario: Selective Feishu Content Publishing

### 1. Scope / Trigger

- Trigger: changing Feishu publish modes, homepage automatic publishing, review single/batch publishing, Canvas `publish.feishu`, the durable publish queue, or Base record/attachment writes.
- The canonical modes are `full`, `text`, and `media`; UI, API, queue, persistence, worker, and CLI code must import the shared contract from `src/lib/feishu-publish-mode.ts`.

### 2. Signatures

- `POST /api/publish/feishu` accepts `{ postIds: string[], publishMode?: "full" | "text" | "media" }`.
- `POST /api/simple/runs` accepts the same optional `feishuPublishMode` when `writeFeishu` is enabled; `SimpleRunInput.feishuPublishMode` persists with the run.
- `enqueueFeishuPublishJob(posts, { ownerUserId, ownerDisplayName, source, sourceRunId?, publishMode? })` persists `FeishuPublishJob.publishMode` in queue JSON and includes it in active-job deduplication.
- Canvas uses `publish.feishu@2` with `config.publishMode`; `publish.feishu@1` upgrades to v2 with `publishMode: "full"` without changing ports or edges.

### 3. Contracts

- Missing mode is compatibility-only and normalizes to `full`; an explicitly supplied unknown mode is invalid. New jobs and runs persist the normalized value, while old JSON without the field reads as `full` without a schema migration.
- `full` writes title, body, metadata, vehicle, and attachments. `text` writes only non-empty title and body, performs only those text read-back checks, and skips tag completion, vehicle validation, media repair, preparation, and upload. `media` writes only attachments, creates an empty-field record when no record id exists, and skips all text/metadata preparation and verification.
- Unselected Base fields must be absent from record create/update payloads; they must never be cleared as a side effect. Custom CLI payloads receive the same projected post/record payload plus the normalized mode.
- Per-item validation preserves partial success: invalid selected content becomes a validation item failure, valid siblings continue, and a job with no valid items fails before any external write.
- Mode-aware post state updates preserve prior state outside the selected category. A `text` success does not reset attachment state; a `media` success does not fabricate text verification.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Explicit unknown API mode | HTTP `400`, no queue insert |
| Missing historical mode | Normalize to `full` |
| `text` item missing title or body | Item validation failure before external write |
| `media` item with no image or video | Item validation failure before external write |
| All items invalid for the selected mode | Terminal failed job, zero Feishu record writes |
| Required selected Base field is not configured | `needs_config` before external write |
| Same owner/posts/mode already active | Return the active job; a different mode may enqueue separately |
| Custom media CLI returns a record id but attachment evidence fails | Preserve record id and report attachment failure, never completed/zero-success |

### 5. Good/Base/Bad Cases

- Good: publish one approved post as `text`; only title/body appear in the CLI record payload and no media work starts.
- Good: publish the same post as `media`; the queue treats it as distinct from the active `text` job and uploads projected images/videos without metadata writes.
- Base: load an old simple run, queue row, or Canvas v1 node without a mode and retain the original complete-publish behavior.
- Bad: include empty metadata fields in selective payloads, silently coerce an explicit typo to `full`, deduplicate jobs without the mode, or report media completion from a record id alone.

### 6. Tests Required

- `.trellis/verification/feishu_publish_mode_check.mjs` covers mode parsing, field projection, custom media evidence, entry-point wiring, and no excluded-field writes.
- Queue, simple-run, review, and Canvas checks cover persisted mode, mode-aware deduplication, old-data defaults, API `400`, `publish.feishu@1` upgrade, and v2 validation.
- TypeScript, lint, build, and the full isolated baseline must pass. Mocked Playwright at 1440x1000 and 390x844 must select all modes on `/`, `/review`, and `/canvas`, assert ARIA/config state and no horizontal overflow, and must not submit a real publish.

### 7. Wrong vs Correct

```typescript
// Wrong: explicit typos silently regain complete-write behavior.
const mode = isFeishuPublishMode(request.publishMode) ? request.publishMode : "full";

// Correct: API boundaries reject explicit invalid values; defaults apply only when absent.
const mode = normalizeFeishuPublishMode(request.publishMode);
await enqueueFeishuPublishJob(posts, { ...context, publishMode: mode });
```

## Scenario: Dongchedi Category Page Serial Rewrite

### 1. Scope / Trigger

- Trigger: changing `dongchedi_page` Simple Run input, Dongchedi category/article HTTP guards, serial execution, pause/resume, per-link state, or encrypted Cookie handling.
- The integration is static HTTP parsing only. Browser automation, CAPTCHA solving, proxy rotation, fingerprint spoofing, and signature bypass are forbidden.

### 2. Signatures

- `POST /api/simple/runs` accepts `{ sourceMode: "dongchedi_page", pageUrl, keyword, targetCount?, cookie?, generateImages?, writeFeishu? }`; `targetCount` defaults to 30 and is bounded to 1-30.
- `PATCH /api/simple/runs` accepts `{ runId, action: "pause" | "resume", cookie? }`; pause/resume are valid only for non-terminal Dongchedi page runs.
- `SimpleRun.status` and `SimpleRunQueueItem.status` include `paused`; per-link status includes `queued`, `running`, `paused`, `filtered`, `draft`, and failure/duplicate variants.
- `DONGCHEDI_COOKIE_ENCRYPTION_KEY` is required only when a Cookie is supplied and must decode to 32 bytes. `DONGCHEDI_PAGE_TASK_TIMEOUT_MS` defaults to two hours and is bounded to one minute through six hours.

### 3. Contracts

- Category URLs require HTTPS, exact host `dongchedi.com` or `www.dongchedi.com`, and a `/news/...` path. Discovery parses only the submitted HTML and returns at most 30 same-host current `/article/{id}` links (while accepting legacy `/ugc/article/{id}` markup); it never follows pagination.
- One loop owns the complete article sequence: resolve/cache media -> safety filter -> tag/ingest -> text/image rewrite -> save independent `draft` -> persist per-link result. The next article cannot start before that sequence finishes or fails. Image task concurrency is 1 for this mode; ordinary Simple Run concurrency remains unchanged.
- Redirects are revalidated against the exact HTTPS host allowlist. HTML requests have bounded timeout, bytes, and redirect count; only transient transport errors receive one retry. `403`, `429`, login/challenge pages, or repeated timeout pause later work. A parsed `Retry-After` sets `resumeAfter` and rejects early resume.
- Optional Cookie plaintext exists only in the worker-local hydrated input. The stored run contains an AES-256-GCM envelope, all browser responses clear both Cookie fields, and terminal completion/failure/termination clears the envelope. Paused work retains only the envelope so an authorized resume can continue.
- Completed drafts survive later article failure. Fewer discovered links, filtered/failed links, or other incomplete per-link results produce `partial` when at least one draft exists. `writeFeishu` is forced false in the domain layer.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Missing session | HTTP `401` |
| Invalid/missing category URL, target, or encryption key | HTTP `400`, no queue work |
| External/non-HTTPS redirect | Reject the source; never follow it |
| `403`, `429`, login/challenge, repeated timeout | Persist visible pause reason, stop before the next article |
| Resume before `Retry-After` | HTTP `400`, queue remains paused |
| One non-stop article failure | Record the link error; keep prior drafts and continue |
| No successful draft | Terminal `failed`; never fabricate content |
| User termination while paused/running | Run and queue become terminal; Cookie envelope is cleared |

### 5. Good/Base/Bad Cases

- Good: discover 30 links, process each end to end in order, save 30 review drafts, and never enqueue Feishu.
- Base: discover 18 for a target of 30, save the usable drafts, and finish `partial` with discovered/target counts.
- Good: article 7 returns `429; Retry-After 30`; keep drafts 1-6, pause article 7 and all later starts, then resume the same persisted list after the allowed time.
- Bad: fetch all 30 first and only then tag/generate, expose Cookie/ciphertext in API JSON, immediately retry challenges, rotate proxies, or synthesize a draft when source content is unavailable.

### 6. Tests Required

- `.trellis/verification/dongchedi_page_check.mjs` covers URL/category extraction, 1/10/30 limits, external redirect rejection, stop classifications, AES-GCM round trip/redaction, one-loop operation order, task/image serialization, partial status, queue controls, and UI wiring without network/provider calls.
- Existing link, Feishu, content-pool, persistence, HEIC review, concurrency, review, queue, lint, TypeScript, build, isolated HTTP, and SQLite checks must remain green. Browser smoke covers 1440x960 and 390x844 without real credentials or external work.

### 7. Wrong vs Correct

```typescript
// Wrong: fetch every source, then fan out rewrite work.
await Promise.all(links.map(fetchAndRewrite));

// Correct: finish and persist one article before starting the next.
for (const link of links) {
  await resolveFilterTagRewriteAndSave(link);
  if (await pauseRequested()) break;
}
```

## Scenario: Canvas Ark Seedance 2.5

### 1. Scope / Trigger

- Trigger: changing `model.seedance`, Ark video generation configuration, provider request/response decoding, or Canvas video-task recovery. This integration uses Ark Content Generation directly; Dreamina CLI is not an active provider.

### 2. Signatures

- `POST {ARK_BASE_URL}/contents/generations/tasks` creates one task; `GET {ARK_BASE_URL}/contents/generations/tasks/{taskId}` queries the same task.
- `submitArkSeedanceVideo(input) -> ArkSeedanceSubmission`; `queryArkSeedanceVideo(taskId) -> ArkSeedanceSubmission`.
- `resolveSeedanceInput(config, promptArtifacts, upstreamImages) -> { prompt, images, promptSource }` resolves the exact provider-facing Prompt and image order before the first POST. `resolveSeedanceFixedReferences(graph, nodeId)` exposes only node uploads plus directly connected `input.images@1`/`input.library-images@1` snapshots to the Inspector mention menu.
- `POST /api/canvas/media` accepts authenticated multipart `mode=seedance-reference`; this mode requires enabled, fully configured TOS and returns only verified public HTTP(S) URLs.
- Environment: required `ARK_API_KEY`; optional `ARK_BASE_URL`, `ARK_SEEDANCE_MODEL` (default `doubao-seedance-2-5-260628`), and `ARK_SEEDANCE_REQUEST_TIMEOUT_MS` (default 30 seconds).

### 3. Contracts

- Create content is ordered text, `reference_image` items, then `reference_video` items. The body also carries `generate_audio`, `ratio`, `duration`, `resolution`, and `watermark`; auth is `Bearer` and must never be logged.
- `model.seedance@1` keeps flat optional config fields `prompt`, `referenceUrls`, `mentionIds`, and `mentionUrls`. Prompt stores opaque `{{seedance-image:<id>}}` markers; parallel mention arrays bind each active id to its original URL. The UI renders fixed official-style `@图片N` chips, but the API receives plain `图片N` text without `@`.
- A non-empty node Prompt and an effective upstream Prompt are mutually exclusive. An empty node Prompt preserves legacy upstream-only behavior. The authoring menu excludes dynamic model outputs; those outputs remain ordinary unmentioned runtime references.
- Canonical image order is direct references, actively mentioned upstream references in first-mention order, then remaining upstream runtime references, with first-occurrence URL deduplication. Reordering changes displayed numbers without changing URL binding; removing a bound image leaves an invalid chip and blocks submission.
- Prompt is non-empty and at most 2,000 characters; duration is 4-15 seconds; references retain the conservative 9-image, 3-video, 12-total limits and must be public HTTP(S) URLs.
- Before POST, the node run freezes the resolved Prompt and images named `图片1..N` in `inputs`. Canvas persists the returned Ark `id` as `providerTaskId`; non-terminal recovery preserves those resolved inputs and performs GET with that id before any re-resolution or upload. `succeeded` requires `content.video_url`.
- `model.seedance` remains version 1 so saved graphs load. Historical `modelVersion` is ignored; absent `generateAudio`/`watermark` values normalize to true at execution.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Missing key or model | Canvas `needs_config`, zero provider requests |
| Empty local Prompt and no upstream Prompt | Graph/run validation error before POST |
| Local and effective upstream Prompt both present | Explicit conflict error before POST |
| Unknown/malformed/unbound marker or removed bound URL | Invalid mention error; never rebind by array position |
| More than nine deduplicated runtime images | Explicit local error before POST |
| Seedance upload with disabled/incomplete TOS or a non-public result URL | HTTP `400`; do not mutate node config |
| Invalid prompt/parameter/reference | Explicit local error before POST |
| Ark HTTP 401/403 | `needs_config` without exposing credentials |
| Other non-2xx | Error includes HTTP status and sanitized provider message |
| Create response without `id` | Non-resumable failure; never auto-resubmit |
| `queued`/`running` | Persist id/status and requeue for GET |
| `failed`/`cancelled` | Terminal provider error with retained task identity |
| `succeeded` without video URL | Explicit terminal failure |

### 5. Good/Base/Bad Cases

- Good: `让{{seedance-image:person}}驾驶{{seedance-image:car}}` binds stable URLs, serializes to `让图片1驾驶图片2`, sends those two image items in the same order, persists the resolved inputs, then a later GET returns the video URL.
- Base: an old node with an empty local Prompt continues to consume upstream text and ordinary ordered images without mention config.
- Bad: bind mentions to array positions, expose dynamic model outputs in the `@` menu, silently choose one of two Prompt sources, accept local-only media paths, bump the node version without migration, or replay POST after ambiguous acceptance.

### 6. Tests Required

- `.trellis/verification/canvas_workflows_check.mjs` executes the adapter with mocked fetch and asserts URL, method, Bearer auth, content roles/order, marker parsing, `图片N` serialization, fixed-versus-dynamic discovery, Prompt conflicts, deleted bindings, old-node loading, resolved-input persistence, GET-only resume, TOS route gating, and zero fetches when unconfigured.
- Mocked Chromium checks must cover keyboard mention selection, immutable chip rendering, numbering after direct-reference reorder, invalid state after removal, plain-text paste, and no Inspector/menu horizontal overflow at desktop and 390px mobile widths.
- TypeScript, lint, build, isolated HTTP/SQLite smoke, and the complete offline baseline must pass without a live Ark/Seedance call.

### 7. Wrong vs Correct

```typescript
// Wrong: a worker restart pays for a replacement task.
await submitArkSeedanceVideo(input);

// Wrong: array position is persisted as the reference identity.
config.prompt = "让@图片1驾驶@图片2";

// Correct: persist the resolved request once, then resume the accepted identity.
const resolved = resolveSeedanceInput(config, promptArtifacts, upstreamImages);
const result = previousNodeRun?.providerTaskId
  ? await queryArkSeedanceVideo(previousNodeRun.providerTaskId)
  : await submitArkSeedanceVideo({ ...input, prompt: resolved.prompt, images: resolved.images });

// Correct: the editor persists stable marker-to-URL bindings; resolution emits official ordinals.
config.prompt = `让${seedanceMentionMarker("person-id")}驾驶${seedanceMentionMarker("car-id")}`;
config.mentionIds = ["person-id", "car-id"];
config.mentionUrls = [personUrl, carUrl];
```

## Trellis Rules

- `.trellis/` is the only active persistent AI collaboration system. `.trellis/spec/fluxpost/` is the FluxPost project-memory layer inside that system.
- `feature_list.json` is a state machine, not a loose todo list.
- A feature cannot be `done` without evidence.
- Update `progress.md` and `handoff.md` after meaningful development, debugging, deployment, or analysis.
