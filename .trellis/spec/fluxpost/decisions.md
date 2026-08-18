# Decisions

Last updated: 2026-07-29

## Scenario: Compact home with TOS-backed vehicle materials

### 1. Scope / Trigger

- The signed-in home has one compact automatic-task workspace. Reusable image selection comes from the authenticated TOS-backed vehicle library; `/content` is content-pool only, while draft review, distribution checks, and administrator configuration remain separate routes.

### 2. Signatures

- Browser input: `materialAssetIds?: string[]` and `viralMaterialAssetIds?: string[]` on `POST /api/simple/runs`.
- Durable input: existing `materialPaths: string[]` and `viralMaterialPaths?: string[]` store validated `LibraryAsset.publicUrl` snapshots.
- Removed: `/api/materials/library`, `/api/materials/scan`, `/api/materials/preview`, `/api/library/migrate`, `/api/generate`, `/api/production/batches`, and `/api/production/posts/regenerate`.
- Storage: `material_assets` and `material_folders` are dropped idempotently from SQLite/PostgreSQL initialization; `library_assets` and related role/collection/tag tables remain active.

### 3. Contracts

- Home pages through `/api/library/assets?role=vehicle` until `nextCursor` is empty, groups visible assets by vehicle collections, and keeps browser selection as asset ids.
- `POST /api/simple/runs` resolves ids under the signed-in account, requires the `vehicle` role, and freezes public URLs before queueing. Workers never reread mutable library records for that run.
- Viral image imitation accepts frozen HTTP(S) vehicle URLs while retaining local-path support only for historical queued inputs.
- Original local images are not migration inputs and are never opened or deleted by table retirement.
- `/review` remains the consumer of generated-post listing and all review/batch/publish write paths.

### 4. Validation & Error Matrix

- Missing workspace session on the vehicle library or simple-run API -> `401`.
- Non-string, missing, inaccessible, or non-vehicle asset id -> `400`; no run is queued.
- Removed local-material route -> `404` with no compatibility handler.
- Non-GET request to `/api/production/posts` -> `405`.

### 5. Good/Base/Bad Cases

- Good: a signed-in user selects up to nine accessible vehicle images, starts viral imitation, and the queued run retains those exact TOS URLs.
- Base: an ordinary compact run receives all currently accessible vehicle ids as general material references; `writeFeishu=false` leaves drafts for `/review`.
- Bad: the browser submits a private asset owned by another user, a reference-only asset, or a raw URL; the API rejects it before enqueue.

### 6. Tests Required

- `simple_viral_run_check.mjs` asserts full cursor paging, asset-id submission, URL freezing, selection limits, and retired-route absence.
- `vehicle_library_check.mjs` dynamically asserts access/role/type rejection plus id order and deduplication; `viral_replication_regression_check.mjs` asserts HTTP(S) URL indexing and dual-reference pairing.
- `compact_only_workspace_check.mjs`, `content_desk_check.mjs`, `db_check.mjs`, and `postgres_schema_check.mjs` assert removal of legacy UI, APIs, types, and schema tables.
- TypeScript, changed-file lint, production build/restart, HTTP `200/401/404`, and read-only PostgreSQL plus SQLite table checks are required without live providers.

### 7. Wrong vs Correct

- Wrong: trust browser URLs or resolve asset ids later inside a queue worker.
- Correct: submit ids, validate account access and `vehicle` role once at the API boundary, then persist immutable public URL snapshots.

## Scenario: Role-aware library tags, themes, and vehicle no-AI boundary

### 1. Scope / Trigger

- `/library` presents reference and vehicle assets in one role-aware workbench. Reference assets keep structured GPT labels plus manual overrides; the vehicle view exposes only user-maintained labels and must not create or wake AI work.

### 2. Signatures

- `GET /api/library/tags?role=reference|vehicle&q=&limit=` returns `{ tags: LibraryTagSuggestion[] }` for assets visible to the signed-in account.
- `POST /api/library/tags` accepts `{ role: "reference" | "vehicle", assetIds: string[], add?: string[], remove?: string[] }` and returns `LibraryTagBatchResult` with updated assets and per-asset failures.
- Repeated `tag` parameters on `GET /api/library/assets` are AND filters. Existing dimension parameters remain supported.
- `POST /api/library/import` keeps its multipart contract. A reference import returns a persisted `job`; a pure vehicle import saves only the asset and returns no `job`.

### 3. Contracts

- `src/lib/library-tags.ts` owns role projection, localized structured labels, case-insensitive deduplication, and manual-override transforms. `reference` reads effective AI + manual tags; `vehicle` builds its profile only from `manualOverrides`.
- New labels write to manual `customTags`. Removing a display label removes every same-label effective source and writes empty/value overrides so retagging cannot restore it.
- Restore AI sends every manual tag dimension through `restoreAi`; metadata save remains separate. `/library` uses `src/lib/theme.ts`; only the image stage stays fixed dark.
- Vehicle imports use the same TOS object and owner/hash dedupe boundary but do not create `library_tagging_jobs`. Cross-role duplicates add the missing role without uploading a second object; adding `reference` creates the reference tagging job atomically.
- `enqueueLibraryTagging(...)` and the worker require a current `reference` role. The worker checks eligibility before the provider call and again before writeback. The import route calls `kickLibraryTaggingWorker()` only when the domain result contains a persisted `job`.

### 4. Validation & Error Matrix

- Missing workspace session -> `401`; missing/invalid `role`, empty asset ids, or empty add/remove -> `400`.
- Owner/admin asset -> updated asset; read-only shared or missing asset -> `{ assetId, error }` without failing other batch items.
- Asset outside the submitted role -> per-asset failure; pure vehicle import -> asset save with zero tagging-job writes and zero worker wakeups.
- Custom tags beyond the per-image limit -> explicit per-asset failure; unknown people state is not projected as a display tag.

### 5. Good/Base/Bad Cases

- Good: two vehicle tags match only assets containing both manual labels; a cross-role duplicate reuses the object and queues AI only when `reference` is newly added.
- Base: a same-role duplicate performs no writes; a mixed batch updates editable assets and reports read-only failures.
- Bad: vehicle suggestions include AI labels, a pure vehicle import wakes the shared AI worker, or a removed reference role receives a late AI writeback.

### 6. Tests Required

- `.trellis/verification/library_assets_check.mjs` asserts reference authentication, projection/removal ownership, suggestion visibility, AND filters, legacy parameters, combobox semantics, batch failures, and theme boundaries.
- `.trellis/verification/vehicle_library_check.mjs` executes isolated import-domain cases for no-job vehicle saves, same-role duplicates, cross-role reuse/job creation, worker wake gating, manual projection, URL state, and hidden AI controls.
- Mocked browser checks cover URL push/back, vehicle import/detail/batch/preview states, desktop/mobile layout, and overflow without live TOS/GPT calls.

### 7. Wrong vs Correct

```typescript
// Wrong: wake the worker for every imported asset.
if (result.status === "imported") kickLibraryTaggingWorker();

// Correct: wake only after the domain persisted a reference tagging job.
if (result.job) kickLibraryTaggingWorker();
```

## Scenario: Canvas V2 main-task shared outputs

### 1. Scope / Trigger

- A V2 batch schedule may explicitly execute eligible upstream Canvas nodes once per main task, freeze selected `text`, `images`, or `videos` outputs, and inject those artifacts into every child task for that main task. Sharing is opt-in, scoped to one main task, and is never a cross-main-task or cross-schedule cache.

### 2. Signatures

```typescript
type CanvasScheduleV2SharedOutput = {
  nodeId: string;
  outputPort: string;
  artifactKind: "text" | "images" | "videos";
};

type CanvasScheduleV2Definition = {
  // Existing fields remain unchanged; missing values normalize to [].
  sharedOutputs?: CanvasScheduleV2SharedOutput[];
};

type CanvasScheduleV2MainTask = {
  sharedRunId?: string;
  sharedStatus?: CanvasScheduleTaskStatus;
  sharedArtifacts?: Array<CanvasScheduleV2SharedOutput & { artifact: CanvasArtifact }>;
  sharedError?: string;
};

retryCanvasScheduleV2SharedTask(
  scheduleId: string,
  account: WorkspaceAccessActor,
  input: { mainTaskId: string },
): Promise<CanvasSchedule>;
```

- `PATCH /api/canvas/schedules/:id` accepts `{ action: "retry-shared", mainTaskId: string }` and returns `{ schedule: CanvasSchedule }`.
- V2 Canvas runs accept `batchContext.phase: "shared" | "child" | "aggregate"`; a shared run has `mainTaskId` and no `childTaskId`.
- Persistence stays in the existing schedule/run JSON or JSONB columns at `schemaVersion: 2`; no database migration is required.

### 3. Contracts

- Preflight validates every shared target before provider execution. All selected targets for one main task are combined into one deterministic shared run whose graph applies main-scoped parameters only.
- A shared target must be enabled, non-input, non-passive, non-`external_write`, strictly upstream of `childResult`, and have exactly one registry output whose id and kind match the configured `text`, `images`, or `videos` port. Its ancestor closure must contain no child-scoped parameter binding.
- A missing historical `sharedOutputs` field normalizes to `[]`. With an empty list, launch keeps the legacy path that atomically creates all child runs immediately.
- With shared outputs, launch creates only the shared run; child tasks remain pending. On completion, reconciliation extracts every configured artifact, replaces each shared node in every child graph with the matching text/image/video literal, removes its incoming edges, preserves and reconnects outgoing ports, then atomically persists the revised schedule plus every child run and queue item.
- Shared failure starts no child runs. Retry targets the first failed shared node in the original run. Frozen artifacts are immutable after success; child retries reuse literalized graphs, and obtaining new shared output requires duplicating the schedule.
- Pause, resume, cancel, process recovery, status derivation, and schedule run-id collection include `sharedRunId`. Aggregation begins only after the existing child terminal-state rules are satisfied.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Missing node id, port, or supported artifact kind | Reject preflight with `Each shared output must select a node, output port, and supported artifact type.` |
| Duplicate `nodeId:outputPort` | Reject preflight with `Shared outputs cannot contain duplicate node ports.` |
| Missing node or stale port/kind | Reject preflight before provider calls; report the missing node or registry mismatch. |
| Input, passive display, disabled, external-write, multi-output, or unsupported-output node | Reject preflight with the matching shared-output eligibility error. |
| Target is the child result or is not strictly upstream | Reject preflight with `Shared output nodes must be strictly upstream of the child result node.` |
| Target ancestor depends on a child-scoped binding | Reject preflight with `Shared output dependencies cannot include child-scoped parameter bindings.` |
| Shared run fails, is missing, or returns the wrong artifact | Mark the main/shared stage failed, persist `sharedError`, and launch zero child runs. |
| `retry-shared` omits `mainTaskId` | HTTP `400` with `mainTaskId is required.` |
| Retry is requested for a non-failed stage, frozen artifact, or started child fan-out | HTTP `400`; do not rerun the shared stage. |

### 5. Good/Base/Bad Cases

- Good: one main-task reference image feeds one shared GPT vision node and three child reference images feed an image node. The schedule creates one shared run, executes vision once, freezes its text, then atomically creates three child runs that each execute image generation once.
- Good: multiple independent or upstream/downstream eligible shared targets execute in the same shared run and every configured port is replaced by a typed literal in each child graph.
- Base: an old V2 definition or a new schedule with `sharedOutputs: []` creates child runs exactly as before; V1 scheduling is unchanged.
- Bad: selecting a social-post assembler, display sink, publish/write node, disabled node, multi-output node, non-upstream node, or any node whose ancestors include a child binding fails preflight before provider or external calls.

### 6. Tests Required

- `canvas_scheduler_check.mjs` must assert one shared run plus three child runs, multi-target extraction, typed literal replacement, output-edge rewiring, identical frozen artifacts, atomic and idempotent fan-out, shared failure/retry guards, lifecycle run-id coverage, recovery, aggregation, and V1/legacy V2 compatibility.
- The same check must reject duplicate/stale ports, unsupported artifacts, input/passive/disabled/external-write/multi-output/non-upstream nodes, and child-scoped ancestor dependencies before mocked provider execution.
- `canvas_workflows_check.mjs` must assert the persisted V2 workflow/API contracts, including `retry-shared` and historical `sharedOutputs: []` normalization.
- Mocked browser checks must assert legal candidate selection, stale-selection removal, preview/runtime shared stages, artifact previews, error/retry UI, and desktop/mobile overflow without live model or external-service calls.
- TypeScript, lint, build, local production restart/HTTP smoke, and the complete Trellis baseline remain required.

### 7. Wrong vs Correct

```typescript
// Wrong: bypass schedule state and retry a shared run from the generic node endpoint.
await retryCanvasNode(sharedRunId, failedNodeId, account);

// Correct: coordinate retry through the schedule so shared status and fan-out stay consistent.
await retryCanvasScheduleV2SharedTask(scheduleId, account, { mainTaskId });
```

## Stable Decisions

- Compact/simple runs expose operator-controlled switches for `useComfyUiKlein`, `directOriginalReference`, `enableVideoTranscription`, and `writeFeishu`. All four default off in the UI and at the simple-run API/domain boundary; only an explicit `true` enables local Klein routing, direct original-image use, Ark video/audio transcription, or auto-approve-and-enqueue Feishu publishing. `writeFeishu=false` or omission skips Feishu enqueue, marks the publish stage skipped, and leaves generated drafts in the content review desk for explicit human approval.
- Every manual or automatic generated-post Feishu publish must create one durable `FeishuPublishJob` before tag enrichment, vehicle-option validation, approval/source persistence, media preparation, or Feishu CLI work. The HTTP enqueue boundary accepts post ids, snapshots one owner-scoped bulk read, and returns `202`; the worker owns all quantity-sensitive preparation and external writes.
- One Feishu publish Job remains one operator-visible result and one summary notification while record creation, verification, and attachment upload run in ordered chunks of at most 10 posts. Each settled chunk persists known record ids, attachment state, per-item failures, and Job progress before the next chunk; unknown record-create outcomes are `retrySafe=false` and are never replayed automatically.
- Simple keyword/link/Feishu/viral/original runs and advanced single generate/regenerate expose a default-on `图片生成` switch. `generateImages=false` makes the workflow text-only: it must not call image providers, must not require viral material images or selected image tasks, and should save drafts with `imageUrls=[]` plus a visible skip note. When `generateImages=true`, provider calls still require at least one selected image task for source-based simple/advanced generation; no selected task is a local text-only skip, not a production failure. Review-desk manual `重新生成图` is an explicit image action and is not disabled by this run-level switch.
- Source-based generated posts may carry direct source videos as final materials through optional `GeneratedPost.videoUrls`, but only behind the default-off `引用源视频素材` / `includeSourceVideo` switch. UI state, API parsing, simple-run normalization, batch jobs, and `generatePost(...)` must treat omission or `false` as no source-video attachment. When enabled, generation resolves one final source video reference through `src/lib/source-video-reference.ts`, preferring `downloadedVideoUrl` and falling back to `videoUrl`; do not store both the local cached video and the remote fallback for the same source. These videos are review/publish materials, not generated images, and extracted `videoFrames` remain the visual source of truth for preview, tagging, and source-image tasks.
- Generated posts produced by simple runs carry `taskKeyword` for Feishu vehicle defaults. The review desk should display `feishuVehicle ?? taskKeyword ?? ""` so users can keep the keyword default or manually select a different Feishu vehicle option before approval/publish.
- `.trellis/spec/fluxpost/` is the single persistent project context for AI collaboration and handoff.
- `AGENTS.md` is the session startup protocol and rule index, not a full product encyclopedia.
- Source-link imports must not write harvested source content back to a Feishu source-import Base. Imported links enter the local content pool; later generated drafts may still publish through the generated-post Feishu publish queue.
- Source upload remote is `https://github.com/Jacobshujun/fluxpost-studio.git`. The 2026-06-08 upload treats the local workspace as the initial Git snapshot because the remote returned no refs before pushing.
- The app currently uses Next.js App Router with API routes under `src/app/api`.
- Runtime state uses PostgreSQL when `DATABASE_URL` is configured; `src/lib/database.ts` owns the backend selection.
- Production configuration has two layers: `/opt/fluxpost-studio/shared/env.production` is the operator-managed Compose base, while admin changes from `/config` persist in the `fluxpost_fluxpost-config` named volume and override matching base values. Empty persisted assignments are intentional clear tombstones. The container must not write the host base environment file.
- Fresh Ubuntu production uses the repository bootstrap and release scripts rather than ad hoc server edits. Before DNS is ready, deployment starts only PostgreSQL and app and keeps the app on loopback for SSH-tunnel access; Caddy starts only after `enable-domain.sh` validates a DNS hostname. `FLUXPOST_PROXY_ENABLED` defaults true, `FLUXPOST_PUBLIC_HOST` defaults `bbs.vollov1.xyz`, and `FLUXPOST_APP_PORT` defaults `3101` so the existing VPS remains backward compatible. Deployment never removes named volumes and does not modify SSH, DNS, or firewall rules.
- This local workspace is configured to use PostgreSQL through `.env.local`; SQLite at `data/fluxpost.db` remains the fallback when `DATABASE_URL` is absent.
- PostgreSQL schema lives in `db/migrations/001_initial_postgres.sql`, and SQLite-to-PostgreSQL row copy lives in `scripts/db/migrate-sqlite-to-postgres.mjs`.
- Local PostgreSQL diagnosis uses dedicated read-only role `fluxpost_reader` and Windows user environment variable `FLUXPOST_DIAG_DATABASE_URL`; use `npm run db:diagnose` instead of reading `.env.local` or printing `DATABASE_URL`. The role reads app runtime tables, safe account/session views under `diagnostics`, and PostgreSQL stats/settings for lock/session diagnosis.
- Workspace access now defaults to small-team whitelist mode. `WORKSPACE_AUTH_MODE=whitelist`, `WORKSPACE_ALLOWED_USERS`, `WORKSPACE_ADMIN_USERS`, and `WORKSPACE_ACCESS_PASSWORD` configure local access; `WORKSPACE_AUTH_MODE=accounts` keeps the older account-table mode available.
- Whitelist users use stable account ids shaped as `whitelist:{username}` and sessions are stored in `workspace_sessions` with the HttpOnly `fluxpost_session` cookie. `WORKSPACE_ACCESS_PASSWORD` is only the first-admin setup key and must not be copied into Trellis docs.
- In whitelist mode, daily login uses per-user `scrypt` password hashes stored in `workspace_accounts`; whitelist usernames without a created active account cannot sign in.
- `WORKSPACE_ADMIN_USERS` controls first-admin bootstrap eligibility and forced admin role for listed whitelist usernames. Existing admins can also create, update, reset, disable, promote, and list workspace accounts. Normal members can see only records stamped with their own `ownerUserId`; admins can see all workspace records. Unowned legacy records are admin-only under member filters.
- Mutating workspace API routes require a signed-in workspace account before local writes, queue creation, or external provider calls. Simple-run submissions persist `ownerUserId` and `ownerDisplayName`, simple-run Feishu publishing uses the persisted run owner, and manual Feishu publish uses the current account id. Read-only local diagnostics remain available without a browser session.
- Legacy JSON files under `data/` are retained as one-time migration sources and compatibility artifacts, not the primary runtime write store.
- Crawled/source-imported video candidates are ranked before media caching by returned width, height, bitrate, quality strings, and known URL/field hints. The app does not perform extra remote probing by default; when metadata and hints are unavailable, original candidate order is preserved.
- Video media caching may retry same-source fallback candidates after a selected remote video URL fails to download. Fallbacks are extracted from preserved raw/media URLs, de-duplicated, ranked by returned quality metadata, and prefer direct CDN video URLs after the primary candidate.
- Crawled media binaries should be stored on disk under `public/media/crawl`; the runtime database stores metadata, original remote URLs, local app paths, and cache status rather than image/video binary payloads.
- Runtime-created crawled/generated media is served through a local Next API route plus beforeFiles rewrites, while browser-facing paths remain `/media/crawl/...` and `/generated/...`.
- Remote media request headers are centralized in `src/lib/media-request.ts`. Douyin media hosts and likely ByteDance video CDN hosts such as `zjcdn.com` use Douyin Referer/Origin headers, and likely video requests use identity transfer encoding so downloadable Douyin videos can be cached and framed reliably.
- Local image byte-format detection is centralized in `src/lib/image-format.ts`. Media caching, local media serving, and source visual tagging should use this helper instead of trusting file extensions or response headers alone.
- Crawled image caching validates local image bytes before returning a durable URL. Byte-sniffed HEIC uses locked `heic-convert@2.1.0` at JPEG quality `0.9`, validates the JPEG header, and atomically replaces the staged file before cleanup/TOS PUT+HEAD; unsupported formats are removed and reported instead of becoming broken previews.
- Local media serving sniffs image bytes before extension fallback, so browser-facing cached files can be served with the correct content type even when a platform CDN response was saved under a mismatched extension such as WebP bytes in an `image-N.jpg` file.
- Frontend image previews append a cache-bust query to local `/media/...` and `/generated/...` URLs. Native `*.tos-cn-*.volces.com` objects load directly, configured custom TOS URLs receive a cacheable `307` from `/api/media/proxy`, and source CDNs that need request headers remain body-proxied; the proxy rejects HEIC headers or bytes.
- Keyword/platform/type selection is controlled before crawling through platform request parameters. After TikHub returns results, the app must not apply local keyword relevance filters, Xiaohongshu image/video post-filters, fallback all-type searches, or cross-platform result drops in the crawl ingest path. The post-crawl path may dedupe, slice to the requested count, cache media, tag, and persist.
- Batch source-link import remains available as an advanced content-pool ingest entry point at `POST /api/crawl/links`. It does not change `/api/crawl/jobs` keyword-search semantics. Link import resolves each supported source URL through either TikHub detail/share endpoints or a local source-link importer, normalizes it as `NormalizedSourceItem`, caches media, applies crawl-stage content safety filtering, applies AI source tagging, and persists through `ingestCrawlItems(...)`.
- Xiaopeng BBS (`小鹏社区`) is supported only as a source-link/ID import platform, not as a TikHub keyword crawl platform. Link-import mode accepts full `https://bbs.xiaopeng.com/thread/{id}?tidType=1` URLs by auto-detection; pure numeric thread ids such as `3776077` require the user to select `小鹏社区`. The local importer parses public Next.js `pageData` from the thread HTML and normalizes it as `platform="xiaopeng_bbs"` before reusing media cache, safety, tagging, content-pool, production, and Feishu paths.
- Dongchedi (`懂车帝`) is supported only as a source-link/ID import platform, not as a TikHub keyword crawl platform. Link-import mode accepts current `https://www.dongchedi.com/article/{id}` and legacy `/ugc/article/{id}` URLs by auto-detection; pure numeric article ids such as `7643008384274546713` require the user to select `懂车帝`. The local importer fetches public article HTML, parses embedded article JSON when available, normalizes it as `platform="dongchedi"`, and fails clearly on ByteDance/Dongchedi anti-bot challenge HTML instead of importing empty items.
- Crawl-stage content safety is governed by the versioned workspace policy documented above. It runs after TikHub/media caching and before AI tagging/content-pool ingest; kept items retain `safetyAssessment`, while filtered items do not enter tagging, content-pool ingest, simple-mode production, or Feishu publish.
- Content tag `提车记录` is for owner pickup/delivery/pickup-day records. It remains a content-pool/tagging category, but tagged items are archival/observe-only material and must not enter downstream content production. Source tagging may normalize aliases such as `提车`, `提车作业`, `车主提车`, `新车交付`, and `交付记录` to `提车记录`. Shared production planning must mark `提车记录` sources as `observe_only`, simple automatic production must skip them before generation, and manual content-tag edits must recalculate production plans so production eligibility follows the current tag set.
- Xiaohongshu keyword search currently uses TikHub App V2 `/api/v1/xiaohongshu/app_v2/search_notes`, with the frontend document link pointing to `https://docs.tikhub.io/420136398e0`. Internal Xiaohongshu `noteType=2` maps to App V2 `note_type=普通笔记`, `noteType=1` maps to `note_type=视频笔记`, `noteType=3` maps to `note_type=直播笔记`, and all/undefined maps to `note_type=不限`. Supported App V2 sort pass-through values are `general`, `time_descending`, `popularity_descending`, `comment_descending`, `collect_descending`, and `english_preferred`; unknown sort values normalize to `general`.
- Weibo keyword search currently uses TikHub Weibo App `/api/v1/weibo/app/fetch_search_all`. It sends `query`, `page`, and numeric `search_type`; `includeType=pic` maps to `search_type=63`, and `includeType=video` maps to `search_type=64`. The old Web V2 `q`/`include_type`/`timescope` shape is not used.
- Weibo App response normalization uses a dedicated `mblog` extractor and does not rely on generic likely-array selection, because App payloads can contain UI layout arrays. Weibo content images come from `pics`, `pic_infos`, and direct content image fields; broad raw-record image fallback is disabled for Weibo to avoid avatars, icons, and ad decorations.
- Douyin keyword search currently uses TikHub `/api/v1/douyin/search/fetch_general_search_v1`. Internal Douyin sort mapping is `0/general/relevance -> sort_type=0`, `1/most_liked/likes_desc -> sort_type=1`, and `2/latest/time_descending/published_desc -> sort_type=2`; content-type mapping is `0/all -> content_type=0`, `1/video -> content_type=1`, `2/image/picture -> content_type=2`, and `3/article/text -> content_type=3`. Pagination uses `cursor`, carrying returned `search_id` and `backtrace` when available.
- Douyin source-link import routes `/note/{id}` links through TikHub `/api/v1/douyin/web/fetch_one_video_by_share_url`, not `/api/v1/douyin/web/fetch_one_video_v3`; direct `/video/{id}` links can still use `/fetch_one_video_v3`, with share-url fallback if that detail call fails. Douyin source-link normalization must unwrap `aweme_detail`/`awemeDetail` records so source ids and carousel media are not lost.
- Douyin `desc`, `content`, and `text_raw` fields are body/description text, not source titles. Desc-only Douyin records should have blank `NormalizedSourceItem.title` and populated `contentText`; Feishu source-import title writes must not fall back to body text when the source has no explicit title.
- For Douyin `content_type=2` image requests, normalized candidates must have true carousel/image fields from the Douyin raw record. Video-cover-only cards returned by TikHub are skipped, and kept image candidates must not carry direct video URLs into media caching or keyframe extraction.
- Douyin image/text carousel assets must be extracted from raw carousel image records, primarily `raw.images`, with one best supported JPEG/WebP URL per asset. Do not use broad recursive fallback or video cover variants as the primary image source for Douyin image posts. Existing Douyin content-pool records may be repaired from preserved `raw.images`, and stale local `downloadedImages` should be dropped when raw repair changes source-image order.
- For video/mixed source items with extracted frames, the frames are the visual source of truth for preview, visual tagging, manual visual tag editing, and default production image tasks.
- For video-like source items (`mediaType` video/mixed, video URL/local video present, or `mediaCache.videoPresent=true`), automatic/default production can proceed when either a direct source video reference or extracted `videoFrames` exists. Source images, downloaded images, platform covers, origin covers, and dynamic covers are still not a valid fallback for image tasks when frames are missing. Image-only source items continue to use downloaded/source images.
- Video/mixed source items expose at most 5 selected video highlight frames globally. Selection is centralized in `src/lib/video-frame-policy.ts`, ranks highlight/scene-change/cover/interval frames by score/type, dedupes by frame URL, spaces close timestamps where possible, filters visually similar frames when local perceptual hashes are available, allows fewer than 5 frames for single-shot videos, and removes stale unselected local frame URLs from `mediaUrls`.
- Image processing prompts are routed by visual tag: `APP` and `内饰空间` keep the original image without calling an image model; `汽车外观` and `车型美图` use the car-exterior strategy; `带文字图` uses the text-image strategy; and `人车美图` uses the people-with-car strategy. `带文字图` has priority for poster/info images with significant titles, selling points, parameters, explanatory text, footnotes, or brand poster copy even when a full vehicle is the core subject. `车型美图` means pure vehicle exterior beauty shots without people or significant title/explanatory text, while `人车美图` requires a visible person plus vehicle exterior.
- Generated post titles use the shared hard title guard in `src/lib/title-guard.ts`: each draft picks short 10-13, medium 14-17, or long 18-20 visible-character profiles, within a global 10-20 range. The selected profile must be used by the main prompt, title-only repair prompt, validator, and local fallback, and the global 20-character maximum is an unconditional upper bound. AI review edits and generated-post persistence also clamp titles through `clampGeneratedTitleMax(...)` so no generated title can be saved above 20 visible characters.
- The local image-generation model defaults to `gpt-image-2` through `OPENAI_IMAGE_MODEL`; the configured image request base URL and API key remain environment-driven.
- GPT-Image-2 image size is a workspace-level production setting backed by `src/lib/image-size-options.ts`. Users can type `auto` or a validated manual `widthxheight` value between `64x64` and `8192x8192`; the UI still offers presets `auto`, `1024x1024`, `1024x1536`, `1536x1024`, `2048x2048`, `2048x1152`, `1152x2048`, `3840x2160`, and `2160x3840`. The default is `1024x1536`; valid manual values are passed through to the GPT-Image-2 request size instead of being folded to the nearest preset.
- Provider-returned base64 image outputs are saved directly under `public/generated/` without local fixed-size normalization or `ffmpeg` cover-crop resizing. The selected GPT-Image-2 size remains an upstream request parameter only. `keep` mode and recoverable source fallbacks inspect remote bytes and return only durable browser-readable local/TOS media: HEIC converts through `heic-convert`, WebP converts through the existing image transcode path, other supported bytes are persisted, and failures return `needs_review` without retaining the source URL.
- Image API credentials can be configured separately with `OPENAI_IMAGE_API_KEY`, falling back to `OPENAI_API_KEY` when the image key is empty. `/api/config` exposes only non-sensitive image status such as `openaiImageConfigured`, `imageProvider`, `imageModel`, `openaiImageBaseUrl`, and `openaiImageRequestTimeoutMs`.
- GPT-Image-2 can use an optional backup Images API route configured by `OPENAI_IMAGE_BACKUP_BASE_URL` and `OPENAI_IMAGE_BACKUP_API_KEY`. `/api/config` exposes only non-sensitive backup status/base URL.
- Image routes use fixed provider profiles instead of arbitrary request/response mapping: `openai_json` is the minimal non-stream official contract, `openai_sse` preserves relay streaming, and `toapis_async` owns task submission/upload/polling. Primary and backup profile/model values resolve independently.
- New profile values take precedence, while `OPENAI_IMAGE_API_DIALECT` remains a rollback-compatible input. Image-provider capability probes are explicit admin actions that run one text and one reference generation; configuration saves and the default baseline never trigger paid work.
- Standard GPT-Image-2 Images API calls keep an in-process active route. Primary route failures switch to backup, and backup route failures switch back to primary. Failover is limited to route-level failures such as auth/upstream/timeout/gateway/non-JSON failures; content-safety and invalid-image errors remain hard image errors.
- GPT-Image-2 image generation uses the OpenAI Images API shape. Text-to-image requests use JSON `POST /images/generations`; selected reference-image editing/image-to-image requests use multipart `POST /images/edits` with binary `image` upload. Requests send `n: 1`; multiple requested images are produced by repeated one-image requests.
- `OPENAI_IMAGE_ENDPOINT=runninghub` is no longer a supported image provider path. Unknown or stale image endpoint values are normalized to `images` so local old RunningHub env values do not dispatch RunningHub requests.
- Image-generation request timing is environment-driven through `OPENAI_IMAGE_REQUEST_TIMEOUT_MS` for both `/images/generations` and `/images/edits`.
- Car-exterior and people-with-car selected source-image strategies are controlled by `COMFYUI_KLEIN_ENABLED`. With the default `false`, those tasks use the OpenAI Images/GPT-Image-2 path with `SourceImageTask.provider="openai_images"`. With `COMFYUI_KLEIN_ENABLED=true` and a configured workflow source, those tasks use `provider="comfyui_klein"` with `strategyKey` values `carExterior` and `peopleWithCar`; text-image tasks continue to use the OpenAI Images API path, and interior tasks keep the original source image.
- ComfyUI Klein configuration is environment-driven. `COMFYUI_KLEIN_ENABLED` is the explicit routing switch. `COMFYUI_KLEIN_WORKFLOW_API_JSON`/`COMFYUI_KLEIN_WORKFLOW_JSON` can provide inline API workflow JSON and take precedence over `COMFYUI_KLEIN_WORKFLOW_PATH`, which points to the local workflow JSON file. `COMFYUI_BASE_URL` points to the local ComfyUI server, node-id env values identify the prompt/image/KSampler/save nodes, and `COMFYUI_KLEIN_KSAMPLER_*` env values can override seed, steps, cfg, sampler, scheduler, and denoise without code changes.
- The ComfyUI Klein workflow is a single local workflow and must be serialized through the dedicated `localImage` concurrency pool. `WORKER_LOCAL_IMAGE_CONCURRENCY` defaults to `1` and is hard-capped at `1`; normal user and batch submissions may continue concurrently while Klein image slots wait for the local lane.
- Local ComfyUI Klein task state is persisted in `image_generation_queue` for observability. This table records queued/running/completed/failed local image jobs, but it is not yet a durable replay worker for in-flight ComfyUI prompts after a server restart.
- `COMFYUI_KLEIN_FAILURE_POLICY=fallback_source` is the default safety policy only for tasks actually routed to enabled/configured Klein. A failed Klein task falls back to the original source image for that image slot, while `fail` can be used to make enabled Klein failures hard image-generation failures.
- Image production uses a per-image fallback policy for ordinary selected source-image tasks: a selected single-image task that exceeds 180 seconds, hits a gateway/5xx/429 response, or hits a temporary provider overload/rate-limit error falls back to the original source image for that slot instead of failing the whole draft. Viral imitation image tasks are the exception: they carry `SourceImageTask.referencePolicy="strict_dual_reference"`, must use `OPENAI_IMAGE_ENDPOINT=images`, must prepare exactly two reference images through `/images/edits` (target vehicle image first, viral source style image second), and the final prompt from `buildSingleImageTaskPrompt` must restate the Reference image 1/2 roles so the generic single-reference wrapper cannot override the viral style prompt. Strict viral tasks must return `needs_review` diagnostics instead of falling back to a non-viral-style source image. Simple viral runs save the draft with AI review notes and skip automatic Feishu publish when strict viral image generation needs review. Non-recoverable image errors still fail. Reference images are normalized through `ffmpeg` before model input so their longest side is capped at 2400px while preserving aspect ratio.
- Image provider requests must not be submitted with an empty prompt. Simple-mode production resolves a fallback image prompt from draft/source context when the text model returns an empty `imagePrompt`, and the generic image-generation entry skips locally with an execution-log entry when there are no selected image tasks and no prompt.
- High-throughput external work uses application-level shared concurrency pools in `src/lib/concurrency.ts`. Current defaults are crawl `12`, media `30`, GPT `50`, image `100`, Feishu `50`, and production `30`; GPT is hard-capped at `50`, image at `100`, and Feishu at `50`.
- Feishu attachment uploads use a separate lower concurrency pool, `WORKER_FEISHU_ATTACHMENT_CONCURRENCY`, with default `3` and hard cap `10`; record creation and other Feishu CLI calls still use the main Feishu pool.
- Simple-mode starts are persisted through `simple_run_queue`. `POST /api/simple/runs` saves the run, enqueues durable work, returns immediately, and starts in-process workers. PostgreSQL queue claiming uses `FOR UPDATE SKIP LOCKED`; SQLite has a local fallback claim path.
- Feishu Base publishing is persisted through `feishu_publish_queue`. Manual publish and simple-run publish enqueue jobs instead of calling Feishu CLI synchronously. The Feishu publish worker calls the existing `publishPostsToFeishu(...)`, persists returned per-post Feishu state and record IDs, and updates related simple-run publish status asynchronously.
- Feishu publish queue claiming uses PostgreSQL `FOR UPDATE SKIP LOCKED` and a per-`owner_user_id` running-job guard, so one owner/user has at most one active Feishu CLI write while collection, tagging, text generation, image generation, and other owners' Feishu queues can continue.
- Feishu publish queue ownership and generated-post ownership are separate. Manual publish jobs use the signed-in operator as the queue `ownerUserId` for queue visibility/serialization, but enqueueing must preserve each `GeneratedPost.ownerUserId`/`ownerDisplayName`; otherwise admin-visible posts owned by another member can fail local persistence with `Generated post not found` before Feishu work is queued.
- V1 Feishu/Lark conversation task launch is a local polling CLI path, not a public webhook. `npm run lark:tasks` reads allow-listed chats through `lark-cli`, submits explicit `/flux` or `发稿` messages to local `POST /api/lark/tasks`, and that route requires `LARK_TASK_API_TOKEN`, `LARK_TASK_CHAT_IDS`, and `LARK_TASK_USER_MAP` before enqueueing through `startSimpleRun(...)`. Runtime idempotency is persisted in `lark_task_launches` by unique `message_id`.
- V2 Feishu/Lark conversation task launch adds a real-time local CLI event consumer. `npm run lark:events` runs `lark-cli event consume im.message.receive_v1 --as bot`, enforces the same chat allow-list, sender mapping, local bearer token, and idempotency path by submitting received task messages to `POST /api/lark/tasks`, and avoids polling old chat history. It is still a local long-running process, not a public webhook.
- `DELETE /api/simple/runs` is the operator force-terminate path for simple runs. It marks the selected run as failed/interrupted, fails the matching `simple_run_queue` item, records an execution-log entry, and guards later in-process workflow saves from reviving a force-terminated run. The UI exposes this as `强制终止` in `精简版` bottom progress and `简单版` run summary.
- `POST /api/simple/runs` supports keyword platform crawl, exact source-link import, Feishu task-number import, viral imitation, original creation, and content-pool secondary creation. Link-mode simple runs persist `sourceMode="links"` plus normalized `links`, resolve source links server-side via `resolveSourceLinks(...)`, skip keyword platform search and top-up, persist per-link results on `SimpleRun.linkResults`, then reuse the existing source safety, tagging, content-pool ingest, production, image, and Feishu publish stages.
- Scenario: content-pool secondary creation via `/content`.
  1. Scope / Trigger: `/content` is the standalone content harvesting and content-pool desk; the main workspace links to it and keeps advanced production/materials only.
  2. Signatures: `SimpleRunInput.sourceMode` includes `"pool"` and `sourceItemIds?: string[]`; `POST /api/simple/runs` accepts the same fields and delegates to `startSimpleRun(...)`.
  3. Contracts: pool runs read selected samples through `getSourceItemsByIds(sourceItemIds, simpleRunAccessActor(input))`, then reuse simple-run safety filtering, tagging, production, image, draft persistence, run progress, and review-desk flow.
  4. Validation & Error Matrix: empty `sourceItemIds` -> 400/domain error; inaccessible ids are omitted by owner-scoped reads and reported in progress; pool mode normalizes `writeFeishu` to `false`.
  5. Good/Base/Bad Cases: good = selected owner-visible content-pool samples produce draft posts; base = missing or inaccessible selected ids are counted; bad = pool run must not crawl TikHub, import links, import Feishu records, or enqueue Feishu publish.
  6. Tests Required: `.trellis/verification/content_desk_check.mjs` must assert `/content` calls content-pool/crawl/link/simple APIs, sends `sourceMode: "pool"`, `sourceItemIds`, and `writeFeishu: false`, and verifies route/domain support.
  7. Wrong vs Correct: wrong = embedding the full content-pool UI again in `src/app/page.tsx` or auto-writing pool output to Feishu; correct = `/content` owns harvesting/pool operations and pool output enters `/review` as drafts.
- Feishu simple-mode task-number imports persist `sourceMode="feishu"` plus normalized `feishuTaskNumbers`, search the configured Feishu Base/table by exact `任务编号`, read `动态标题`, `动态正文`, `动态素材`, and `车型`, download `动态素材` attachments through `lark-cli base +record-download-attachment`, store imported materials under `public/media/crawl/feishu`, and persist per-task results on `SimpleRun.feishuResults`. Imported `车型` values are grouped into corresponding content-pool keywords/projects before production; generated output still publishes through the existing generated-post Feishu fields.
- Feishu distribution audit is a separate operator-triggered write-back tool, not part of simple-run production. `/distribution-check` accepts Feishu record `编号` values, reads the configured Base record fields, conservatively decides whether the content is cross-account Xiaohongshu distributable, scores the content independently, and writes the existing single-select `是否分发` field plus numeric `内容评分`. The score must not directly force the `是否分发` decision. The tool must use `lark-cli base +...` commands, require workspace auth, preflight fields before writes, and avoid attachment download/upload.
- The `/distribution-check` audit prompt is operator-editable and persisted in workspace settings as `distributionCheckPrompt`. Custom prompt text may guide model judgment, but backend hard guards remain authoritative: JSON-only output, `distribution` limited to `可分发`/`不可分发`, and uncertain or invalid model output normalized to `不可分发`.
- Simple-mode queued work survives local server restart. Already-running stale simple work is marked interrupted instead of being blindly replayed, because Feishu record creation is not yet idempotently mapped per post and replay after a publish-stage crash could duplicate Base records.
- Simple runs persist the platform crawl settings captured at submission time so delayed queued execution is not affected by later workspace setting edits.
- Simple-mode platform crawling and post production are bounded concurrent workflows. Progress writes are serialized with an in-process update queue to avoid overwriting `simple_runs` state.
- Simple-mode production must persist each generated post and record it in the simple-run snapshot before syncing source-item usage status. Source-status sync failures in the simple workflow are non-fatal warnings so a persisted draft remains visible and Feishu publish enqueue can continue.
- Simple-mode publish preparation must not fan out approved-post local persistence with `Promise.all`. Approved posts are persisted sequentially before Feishu enqueue, and transient PostgreSQL deadlock/serialization conflicts during local post persistence are retried briefly so one runtime-state conflict does not fail the whole publish stage before the Feishu job is created.
- Simple-mode crawl first requests an even per-platform share, then performs one cross-platform top-up pass when deduped candidates are still below the target. Top-up still uses normal platform request parameters and the only post-provider operations remain dedupe and slice.
- Simple-mode automatic production skips image-only source items that have no `downloadedImages`, no source `images`, and no `videoFrames`, and skips video-like source items only when both direct source video references and extracted `videoFrames` are missing. Those items can still be ingested and tagged, but they do not enter automatic generation.
- Simple-mode one-click production uses the same global production defaults as advanced mode: workspace text/image prompts, image size/quality, per-platform crawl settings, and the current advanced production material paths assembled from scanned materials plus material-library assets.
- Workspace modes now include `精简版`, `简单版`, and `高级版`, with `精简版` as the default UI entry. `精简版` uses the same simple-run backend, saved simple workspace settings, and polling state as `简单版`, but renders only a full-width task launch panel plus a fixed bottom overall progress bar; when multiple simple runs are queued/running, that bottom progress bar shows multiple live run rows instead of only the active/latest run. `简单版` retains the detailed run status/results/history panel.
- Desktop scrolling uses a fixed top command area and internal workspace-panel scrolling. The header, workspace mode switcher, and advanced command/module controls remain in `studio-topbar`; simple and advanced long content should scroll inside the relevant `ops-panel` surfaces instead of moving the whole page. Compact mode keeps the fixed bottom progress bar.
- Successful v4 deploys and applied standalone cleanups own scoped Docker retention: remove unused verification and historical immutable app tags, keep `latest` plus the two newest `rescue-*` tags ranked by Docker image creation time, protect every container-referenced image, and install a weekly 168-hour BuildKit cache prune. Failed releases and cleanup previews do not mutate maintenance state, and no path may global-prune Docker, remove volumes, or manipulate Docker/containerd storage files directly.
- Advanced mode exposes an explicit `保存采集策略` action for the current platform controls. This persists the platform crawl strategy used by simple mode without starting a crawl job; Douyin cookies remain request-only and are not part of the shared simple-mode strategy.
- Advanced batch production is bounded by the production pool, with serialized batch-job status writes.
- Content-project runtime writes use row-level database upsert rather than full-table replacement, because concurrent source-status updates can otherwise collide on PostgreSQL `content_projects` primary keys.
- `markSourceRewritten(...)` retries PostgreSQL `40P01` deadlock and `40001` serialization conflicts before surfacing the source-status update failure.
- Generated post runtime mutations use row-level database operations rather than full-table replacement. Save/update/status changes use upsert, and single/batch delete use row-level delete helpers, because concurrent generated-post updates can otherwise collide on PostgreSQL primary keys or lose concurrent changes.
- Source visual tagging preflights remote HTTP(S) image assets and sniffs local app-served image bytes before sending them to the OpenAI-compatible text/vision endpoint. Supported JPEG/PNG/GIF/WebP images are converted to inline data URLs; invalid, unsupported, empty, oversized remote assets, and unsupported local bytes are skipped per image with execution-log details instead of failing the whole visual-tag batch.
- External integrations are environment-driven: TikHub, OpenAI-compatible text/image endpoints, and Feishu CLI.
- Feishu Base publishing defaults to `lark-cli base +record-batch-create --as bot` with a generated `fields + rows` JSON payload.
- Generated-post Feishu Base publishing writes default fields `动态标题`, `动态正文`, `动态素材`, `内容标签`, and `内容创作来源`. `内容创作来源` is derived from `GeneratedPost.ownerDisplayName`, falling back to `ownerUserId` only for historical posts without a display name.
- Feishu Base record creation is chunked at `50` posts per CLI request. A publish can produce multiple record payload files, after which attachments are uploaded per created record/chunk.
- Feishu attachment publishing prepares files before Base record creation; reachable remote HTTP(S) image URLs are downloaded into `public/generated/feishu-attachments` and then uploaded as local files. The existing `imageUrls` field-map key still names the attachment field (`动态素材` by default), but attachment upload now combines `GeneratedPost.imageUrls` and local `GeneratedPost.videoUrls`.
- Feishu publish can return `attachment_failed` when Base records are created or reused but one or more attachment uploads fail. Generated posts persist `feishu.recordId` plus attachment status so a retry can reuse existing records and skip already uploaded attachments.
- Feishu CLI errors and execution-log compaction redact bearer tokens, `--base-token` values, and `FEISHU_BITABLE_APP_TOKEN` values before they are persisted or surfaced.
- Normal execution logging appends one row to `execution_logs` and trims old rows. It must not read and rewrite the whole execution-log table on every log entry, because concurrent log writers can create duplicate-key conflicts or PostgreSQL deadlocks.
- Feishu IM publish notifications prefer `FEISHU_NOTIFY_CHAT_ID` when both chat and user notification recipients are configured.
- Feishu IM publish notifications describe the publish job/batch, not an individual generated post. Batch messages must not label the first post title as the notification title; they show task/source/job context, record/material counts, and a short `内容示例` list instead. Single-post notifications may show the one title as `内容`. Attachment-upload failures may send a `写入飞书部分完成` warning notification when IM recipients are configured.
- Default baseline verification must avoid production external service calls.
- Infinite-canvas capability plans no longer require a browser prompt, including billable models and Feishu writes, so unattended batch execution can proceed after preflight. The client still sends the exact planned confirmation node ids with `confirmed: true`; server-side stale-plan and preflight validation remain mandatory.
- Port `3001` is the only local application environment. Development preview and committed candidate execution share it exclusively; development disables background workers by default and `FLUXPOST_DEVELOPMENT_WORKERS=1` is the explicit worker opt-in.
- Candidate preparation installs locked dependencies while the worktree server is stopped. `npm run local:restart` requires the current worktree to be clean, builds before replacing the listener, injects `candidate` plus the full HEAD, and verifies `/api/version`; only that tested SHA may be pushed and deployed. `npm run local:parity` requires exact equality among clean local HEAD/runtime, GitHub `origin/main`, and production. Secrets, accounts, databases, queues, media, configuration, and provider state are never synchronized as code.
- Default local Next builds use standard output because local production runs through `next start`. Docker builder sets `FLUXPOST_STANDALONE_BUILD=1` to retain standalone output, and output tracing excludes runtime `data`, `public/media`, `public/generated`, and `test-artifacts` paths because production supplies runtime state through named volumes.
- New runtime media on production `38.76.210.136` may use Volcengine TOS behind the default-off `TOS_ENABLED` switch. FluxPost stores verified public absolute URLs with ETag version parameters, sets object-level `public-read`, retains failed uploads under `data/tos-pending`, and keeps historical local URLs and external material directories unchanged. Rollback disables TOS instead of reverting code or rewriting existing URLs. Retired hosts 82 and 104 are not provider-test targets.
- Releases are commit-based without a staging gate: after local deterministic verification and operator approval, deploy the exact full SHA directly to `38.76.210.136`. The wrapper stores immutable image tags plus manifests, preserves production volumes, verifies app/PostgreSQL/Nginx/public health, and restores the prior release/image on activation failure. `104.243.21.233` was permanently retired as a FluxPost target on 2026-07-23.

## Scenario: Shared library defaults, sorting, and marquee selection

### 1. Scope / Trigger

- Trigger: changing visibility defaults, list ordering, pagination, submitter display, or batch selection in `/library` or `/copy-library`.

### 2. Signatures

- `LibraryListSort = "newest" | "oldest" | "name-asc" | "name-desc" | "owner-asc" | "owner-desc"`.
- `GET /api/library/assets?sort=...` and `GET /api/copy-library?sort=...`; image cursors encode `{ version: 1, sort, value, id }`.
- Omitted visibility on normal image/copy creation resolves to `team`; callers may still send `private`.

### 3. Contracts

- Domain services sort the complete filtered result with `zh-CN` text comparison and ID tie-breaking; the image cursor reuses the same comparator. Each page persists its own validated sort key in localStorage.
- Desktop marquee starts only on list/grid background; normal drag replaces selection and Ctrl/Cmd drag adds the pointer-down selection snapshot. Touch keeps native checkboxes.
- Copy batch visibility and deletion reuse per-entry APIs, preserve owner/admin enforcement, confirm deletion, and report succeeded/failed counts.
- Duplicate image reuse never rewrites the canonical asset visibility.

### 4. Validation & Error Matrix

- Missing/unknown `sort` -> `newest`; malformed or cross-sort image cursor -> `Invalid library cursor.`
- Read-only shared entry mutation -> existing permission failure counted in the batch; other entries continue.
- Empty/internal image drop -> close drag state without opening import; file drops retain the existing import path.

### 5. Good/Base/Bad Cases

- Good: owner-sort page 1 and its cursor page 2 form one stable sequence; Ctrl marquee adds cards without opening preview/import.
- Base: refresh restores each library's last valid sort; mobile users select with checkboxes and can return from the copy editor.
- Bad: sort only the loaded client page, accept a cursor from another order, change legacy private assets to team, or let marquee start on a card control.

### 6. Tests Required

- `copy_library_check.mjs`, `library_assets_check.mjs`, and `vehicle_library_check.mjs` assert defaults, explicit private, all six orders, stable cursors, permissions, migration, and marquee geometry.
- Mocked 1440x960 and 390x844 Playwright must assert sort persistence, ordinary/Ctrl marquee, checkbox/editor fallback, batch confirmation/results, no spurious import dialog, console cleanliness, and no page overflow.

### 7. Wrong vs Correct

- Wrong: reorder only `data.assets` in React or default a legacy migration through the new team setting.
- Correct: send the validated sort to the API, paginate with the matching versioned cursor, and make historical privacy explicit at the migration call site.

## Pending Decisions

- Subtask-level durable simple workflow, image-provider task replay, and Feishu per-post idempotency mapping for safe publish-stage replay: 待确认.
- Whether `.tmp-*.json`, `test-artifacts/`, and existing generated media should be cleaned or retained: 待确认.
