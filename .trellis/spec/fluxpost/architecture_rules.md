# Architecture Rules

Last updated: 2026-07-20

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
- GitHub-driven Ubuntu production is owned by `scripts/deploy/vps-bootstrap.sh`, `scripts/deploy/vps-deploy.sh`, `scripts/deploy/vps-enable-domain.sh`, root `compose.yaml`, and `docs/deployment/ubuntu-docker.md`; do not add a second server layout or competing update script.
- New pre-domain installs must keep the app on `127.0.0.1:${FLUXPOST_APP_PORT:-3101}`, start only `postgres app`, and use SSH tunneling. Caddy ports 80/443 start only when `FLUXPOST_PROXY_ENABLED=true` and `FLUXPOST_PUBLIC_HOST` is a validated DNS hostname.
- Deployment code may read only explicit deployment controls from `shared/env.production`; it must not source the file as shell code. The file is root-only mode `0600`, while admin UI overrides remain in the `fluxpost-config` volume.
- Routine install, deploy, domain, diagnostic, and rollback commands must preserve all named volumes. Never add `docker compose down -v` or an equivalent volume deletion path.
- Bootstrap must not change SSH daemon settings, host firewall rules, cloud security groups, or DNS. Those are operator/provider boundaries.
- Do not add a new deployment path, process manager, service file, or server target without updating `project_brief.md`, `decisions.md`, `verification.md`, and `handoff.md`.

## Scenario: Volcengine TOS Runtime Media Storage

### 1. Scope / Trigger

- Applies when changing runtime image/video/frame production, media consumers that require local files, advanced TOS configuration, pending-upload reconciliation, or the `82.158.226.10` deployment.
- Historical local URLs and administrator-managed external material directories stay outside this migration; the storage backend is selected only when a new runtime media file is persisted.

### 2. Signatures

- `persistRuntimeMedia({ filePath, publicPath, contentType?, overwrite? }): Promise<string>` persists a staged file and returns either the existing local public path or an absolute TOS URL.
- `findExistingRuntimeMedia(publicPath): Promise<string | undefined>` reuses a verified same-key/same-length object when TOS is enabled.
- `materializeRuntimeMedia(url, { maxBytes, kind }): Promise<{ filePath, temporary, cleanup }>` resolves local app media or downloads HTTP(S) media for file-only consumers.
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
- Video processing materializes the complete source on the VPS before frame extraction/transcription; only the source video and newly selected final frames are persisted. Historical frames are not uploaded during ordinary cache reads. Temporary HTTP downloads, intermediate frames, audio, and Feishu attachment copies must be cleaned in `finally` paths.
- `GeneratedPost.imageUrls`, `videoUrls`, `downloadedImages`, `downloadedVideoUrl`, and frame URLs remain strings and may contain either historical relative URLs or absolute TOS HTTP(S) URLs.

### 4. Validation & Error Matrix

- Enabled with incomplete TOS config -> fail explicitly before upload; do not fall back to local storage.
- Empty staged file, unsafe path segment, empty bucket/key, invalid public base -> fail before writing a business URL.
- PUT transport error, HTTP 408/429/5xx, or retryable network error -> retry up to the bounded attempt count; retain pending file after exhaustion.
- HEAD missing length/ETag or length mismatch -> treat upload as failed and retain pending file.
- Existing object has the expected length and overwrite is false -> reuse its ETag URL without PUT; force refresh sets overwrite true.
- Media materialization receives unsupported non-local/non-HTTP input, non-2xx response, empty body, or a byte-limit violation -> fail and remove any temporary directory.
- Missing sign-in on TOS admin routes -> HTTP 401; signed-in non-admin -> HTTP 403; failed live probe -> HTTP 502. Probe responses contain boolean check fields only; detailed errors stay in server execution logs.

### 5. Good/Base/Bad Cases

- Good: a newly generated image uploads, HEAD length and ETag match, the local staging file is removed, and the post stores `https://<public-base>/fluxpost/flux-lightmoment/generated/...?...`.
- Base: `TOS_ENABLED=false`; the same producer returns `/generated/...` or `/media/...`, preserving historical behavior and local consumers.
- Bad: TOS upload fails and code silently returns the local URL or deletes the only staged copy; the correct behavior is to retain it under `data/tos-pending` and fail the operation.

### 6. Tests Required

- `.trellis/verification/tos_runtime_media_check.mjs` must assert disabled behavior, key/URL mapping, managed-cache recognition, retries, same-size reuse, overwrite, HEAD mismatch failure, pending retention, successful cleanup, no ordinary historical-frame migration, producer/consumer wiring, route authorization, boolean-only probe responses, and secret masking.
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

- Submit JSON uses `model`, `prompt`, `n: 1`, documented ratio `size`, `resolution: 1k|2k|4k`, `response_format: url`, and optional URL-only `reference_images`.
- Pixel presets map in `src/lib/toapis-image-api.ts`; unknown custom sizes fail before submission. Historical `1200x1600` maps to `3:4`/`1k`.
- Public TOS/HTTP references pass directly. Local references upload first; generation endpoints never receive base64.
- Submission returns a task id. Polling waits at least five seconds with jitter, respects `Retry-After`, and downloads `result.data[].url` into `persistRuntimeMedia` before the 24-hour provider URL expires.

### 4. Validation & Error Matrix

- Missing task id, unknown status, completed task without URL, unsupported size, or invalid upload envelope -> hard error.
- `model_not_found` or `no available channel` -> may fail over before task acceptance, but must never return a source image as completed generation.
- Accepted task status `pending`/`queued`/`in_progress` is non-terminal; query `429`/`500`-`504`/network error retries the same task. Do not create a duplicate paid task on the backup route.
- Terminal `failed` or overall timeout after task acceptance -> surface provider error without resubmission.

### 5. Good/Base/Bad Cases

- Good: ToAPIs completes, FluxPost downloads the temporary URL, TOS verifies the object, and the post stores the durable TOS URL.
- Base: a non-ToAPIs relay under `auto` keeps the existing OpenAI JSON generations and multipart edits contract.
- Bad: ToAPIs returns `queued`, code reads `data[].url` immediately, or a status-query timeout submits a second paid task.

### 6. Tests Required

- `.trellis/verification/toapis_image_api_check.mjs` executes size/body/task/error helpers and asserts upload, submit, query, retry, persistence, and hard-error wiring without live calls.
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
  body: JSON.stringify({ size: "3:4", resolution: "1k", reference_images: [publicUrl] }),
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

## Trellis Rules

- `.trellis/` is the only active persistent AI collaboration system. `.trellis/spec/fluxpost/` is the FluxPost project-memory layer inside that system.
- `feature_list.json` is a state machine, not a loose todo list.
- A feature cannot be `done` without evidence.
- Update `progress.md` and `handoff.md` after meaningful development, debugging, deployment, or analysis.
