# Pitfalls

Last updated: 2026-06-08

## Known Project Pitfalls

- `.env.local` contains secrets and must not be read into Harness docs or final answers.
- The project path is now expected to be a Git repository initialized from the local source snapshot. Local secrets, runtime data, generated/cached media, debug JSON, `test-artifacts/`, `.next/`, and `node_modules/` still exist on disk in this workspace, so verify `.gitignore` and staged files before every push.
- Runtime data is stored in SQLite at `data/fluxpost.db` by default; when `DATABASE_URL` is configured the app uses PostgreSQL instead. Legacy JSON files under `data/` are migration/compatibility artifacts.
- `src/lib/concurrency.ts` provides application-process concurrency control only. It limits provider pressure while the current Node process is alive, but it is not a durable PostgreSQL job queue and does not resume in-flight provider tasks after a server restart.
- `simple_run_queue` persists simple-mode queued work and worker leases, but it does not yet provide subtask-level replay for a run already inside crawl/production/publish. Do not blindly restart a stale running simple run after a crash; until Feishu records are idempotently mapped per post, publish-stage replay could duplicate Base records.
- Do not nest long-running work inside the same provider pool that its child HTTP calls need. For example, platform crawl fan-out should not hold a crawl-pool slot while the nested TikHub requests are waiting for crawl-pool slots.
- The SQLite implementation uses Node.js built-in `node:sqlite`, so the app requires Node.js 24+ for the current local database path.
- PostgreSQL migration copies database rows only. It does not move crawled/generated media files under `public/media/` or `public/generated/`.
- `npm run db:migrate:postgres -- --dry-run` reads SQLite row counts without requiring PostgreSQL. Running the real migration requires `DATABASE_URL` in the shell and a reachable PostgreSQL service.
- `DATABASE_URL` is sensitive configuration. Do not print it, copy it into Harness docs, or include it in final answers.
- Material library assets store local file paths as indexes. Browser preview only works for HTTP URLs or app-served public paths unless a server-side preview endpoint is added.
- `src/lib/media-cache.ts` calls the system `ffmpeg` binary. If `ffmpeg` is not on PATH, video frame extraction can fail.
- `npm run build` currently passes but emits Turbopack tracing warnings around dynamic filesystem paths in `src/lib/media-cache.ts` and an import trace mentioning `next.config.ts`.
- `next start` does not hot reload. After frontend or API code changes, running only `npm run build` can leave an existing `http://127.0.0.1:3001/` process serving old assets. Use `npm run local:restart` to rebuild, stop the old port-3001 process, restart the server, and run local smoke.
- Next production static serving should not be trusted for files created under `public/` after build time. Runtime crawled/generated media must be served through the local media API rewrites, currently `/media/crawl/:path*` and `/generated/:path*` to `/api/media/local/[...path]`.
- Repaired runtime media files may keep the same browser URL. Because local media responses are cacheable, an already-open browser can keep showing old broken bytes unless the frontend preview URL includes the current local media cache-bust query or the browser cache is bypassed.
- On Windows, the process printed by `Start-Process npm.cmd` can be the npm parent, not the Node process listening on port `3001`. If old frontend/API code still appears after restart, check the real listener PID with `netstat -ano -p tcp`; `scripts/local/restart.ps1` now uses this as a fallback and verifies the port is free before starting.
- `data/feishu-outbox/` may be created by publishing when Feishu CLI is not configured.
- The local Feishu CLI command is `lark-cli`; current Base writes use `lark-cli base +record-batch-create`, not the older README example `bitable import`.
- On Windows, a Next/Node server may fail with `spawn lark-cli ENOENT` even when PowerShell can run `lark-cli`. The app wrapper must resolve the npm CLI shim to `@larksuite/cli/scripts/run.js` and invoke it with Node.
- A broken proxy value such as `HTTPS_PROXY=http://127.0.0.1:9` makes `lark-cli doctor` and Feishu writes fail. Use `LARK_CLI_NO_PROXY=1` or clear proxy env values for Feishu CLI commands.
- Feishu Base attachment fields such as `动态素材` cannot be written as normal record cell values. Create the record first, then upload local files with `lark-cli base +record-upload-attachment`.
- Large simple-mode Feishu publishes can fail during `record-upload-attachment` after Base records have already been created. Do not blindly rerun the whole publish for such a run; first confirm existing records/attachments or add an idempotent attachment-resume path, otherwise duplicate Base records are possible.
- Current Feishu publish stores per-post `feishu.recordId` and attachment status when attachments fail. Retry through generated posts that preserve this state so existing Base records can be reused and already uploaded attachments can be skipped; do not clear `post.feishu` before retrying.
- Feishu CLI errors and activity-log messages should redact bearer tokens, `--base-token` values, and `FEISHU_BITABLE_APP_TOKEN` values. If a new CLI path is added, keep token redaction in the error path.
- For Feishu attachments, app-served URLs beginning with `/media/` or `/generated/` are browser paths and must be resolved under project `public/`, not treated as Windows disk-root paths like `C:\media\...`.
- For Feishu attachments, reachable remote HTTP(S) image URLs should be downloaded to `public/generated/feishu-attachments` before Base record creation; expired or protected remote URLs should fail before any record is created.
- `lark-cli base +record-batch-create --json @file` rejects absolute `@` paths and UTF-8 BOM files; use a relative path under the project root and UTF-8 without BOM.
- Root `.tmp-*.json` files and `test-artifacts/` are local artifacts, not project memory.
- Crawled `downloadedImages` can be a partial local cache and may not have the same count as remote `images`; do not infer image coverage from `downloadedImages.length`.
- Xiaohongshu CDN images can display as empty in the browser when requested with the local app as Referer; image elements should keep `referrerPolicy="no-referrer"` and previews should prefer cached local media when available.
- Remote browser previews for HTTP(S) images should use `/api/media/proxy?url=...` so the server can send platform-friendly media headers. This improves preview reliability but does not recover truly expired signed URLs.
- The content-pool `cache_media` batch action can retry downloading existing remote media into `public/media/crawl`, but it cannot recover assets whose platform URL has already expired or no longer authorizes downloads.
- Video local caching only works when the crawler extracted a direct downloadable video URL. HLS/m3u8 or platform-protected playback URLs may remain remote-only unless a different extraction path is added.
- Video posts with local `videoFrames` should not rely on old remote signed cover URLs for preview; use the extracted frames as the image preview.
- Historical video/mixed records may still physically contain more than 5 `videoFrames` until they are read, refreshed, updated, or backfilled. The app should cap stale records through `src/lib/video-frame-policy.ts` in preview, tagging, production-task creation, and content-pool writes instead of mutating runtime data during Harness-only work.
- Video preview requires HTTP byte-range support. The local media API supports Range requests for mp4/mov files; if video previews break again, verify `/media/crawl/.../video-1.mp4` returns 206 for `Range: bytes=0-1023`.
- Weibo video posts can legitimately have `images=[]` while still having cached `videoFrames`; preview and production image selection should treat those keyframes as usable visual references.
- TikHub Weibo App search payloads can contain UI layout arrays such as `{name, layout}` near the real post data. Do not use generic likely-array selection for Weibo; extract `mblog`, `data.mblog`, or direct mblog-shaped records.
- Weibo App image extraction should not use broad raw-record URL fallback. Use content fields such as `pics` and `pic_infos`; otherwise avatars, vote/ad icons, and other decoration URLs can pollute `images`.
- Weibo CDN URLs may serve HEIC bytes even when the local cache path ends in `.jpg`. Media caching should convert cached HEIC bytes to JPEG in place before returning a local preview URL, and visual tagging/local serving must sniff local file bytes instead of trusting the extension MIME.
- Douyin image/text posts can return many URL variants per carousel asset, including `video.cover`, HEIC, JPEG/WebP, and watermarked download URLs. Treat `raw.images` / carousel image records as the primary source and choose one supported JPEG/WebP per asset; otherwise cover/variant URLs can fill the image limit and hide later carousel images.
- TikHub Douyin `content_type=2` image requests can still return video-cover cards. The app should skip records without true Douyin carousel/image fields and strip direct video media from kept image records; if image-only Douyin crawls produce `videoFrames`, recheck this guard first.
- `node:sqlite` currently emits a Node experimental warning; this is expected in Node 24 and did not fail baseline verification.

## Integration Pitfalls

- TikHub, OpenAI-compatible endpoints, and Feishu CLI are external integrations; default baseline must not call them.
- Content safety filtering is a post-crawl brand-safety quality gate, not a TikHub request parameter or keyword relevance filter. Keep rules and prompts in `src/lib/source-safety.ts`, and do not move them into `src/lib/tikhub.ts` or the existing no-post-crawl keyword/type filter checks.
- A live PostgreSQL server is also excluded from default baseline. Baseline only performs a static schema check unless the project later adds an isolated PG test service.
- AI source visual tagging depends on the OpenAI-compatible relay accepting image inputs. If image inputs are rejected, record visual tagging as failed/skipped and keep content text tags/ingest moving; do not invent visual tags as a silent fallback.
- `GET /api/config` exposes configuration status and model/base URL names, but not API keys.
- Feishu CLI arguments can still be template-based through `FEISHU_CLI_BITABLE_ARGS`; the default command is now `base +record-batch-create --as bot --base-token {appToken} --table-id {tableId} --json @{recordPayload}`.
- Feishu Base publishing requires both target identifiers: `FEISHU_BITABLE_APP_TOKEN` (Base token) and `FEISHU_BITABLE_TABLE_ID` (table ID). App id/app secret alone only configure the CLI application identity.
- The current target Base fields are `动态标题`, `动态正文`, and attachment field `动态素材`.
- Feishu publish success notifications are optional and require at least one recipient env value: `FEISHU_NOTIFY_CHAT_ID` or `FEISHU_NOTIFY_USER_ID`. If both are configured, `src/lib/feishu-cli.ts` sends to the chat id. The bot must have message-send scope and access to the target chat/user.
- Feishu notification failure should be surfaced as a publish warning, not treated as a failed Base write after the record and attachments have already been created.
- Feishu IM `--idempotency-key` values should stay short. A long generated key caused `HTTP 400: field validation failed`; use the compact `fp-...` key format in `src/lib/feishu-cli.ts`.
- RunningHub image-to-image accepts accessible image URLs, not local browser paths. The backend must upload local `/media/...` or `/generated/...` files through RunningHub media upload before submitting a G-2 task.
- RunningHub uploaded file URLs are temporary. Do not treat RunningHub `download_url` values as durable local media; Feishu attachment preparation should still download generated remote URLs before upload when needed.
- RunningHub rejects empty `prompt` values with error `1007`. No-media source items can produce `imageTasks=[]`; if the text model also returns an empty `imagePrompt`, the app must use the simple-mode fallback prompt or skip locally instead of submitting the provider request.
- RunningHub can return non-JSON `504 Gateway Time-out` HTML for selected image-to-image tasks. Treat timeout/gateway/5xx/429 temporary provider failures as per-slot source-image fallbacks, but keep non-recoverable image errors as hard failures.
- Default baseline verification must not submit real RunningHub generation tasks. Use local config/status checks and the project baseline unless the user explicitly asks for a paid/live generation test.

## Verification Pitfalls

- Do not invent `npm test`; no `test` script exists in `package.json`.
- Run baseline from the project root.
- If the smoke port is occupied, set `HARNESS_SMOKE_PORT` to a free local port and rerun the same baseline script.
- Do not replace a failing check with a softer fallback. Fix the real failing command, data parse issue, build issue, or smoke assertion.
- In the current workspace sandbox, `npm run build` can pass directly while `Next build` inside `scripts/harness/check.ps1` fails with `spawn EPERM`; rerun the same baseline with approved elevated permissions before changing checks.
- Playwright browser subprocess startup can fail in the sandbox with `WinError 5`; use approved elevated permissions for local browser UI self-checks.
- If Chrome/Edge CDP checks need a custom `--user-data-dir`, do not leave the browser profile directory under the project tree before running baseline. ESLint can scan extension JavaScript from those profiles. Screenshots under `test-artifacts/` are fine, but temporary browser profile folders should be outside the project or removed before `npm run lint` / `scripts/harness/check.ps1`.
