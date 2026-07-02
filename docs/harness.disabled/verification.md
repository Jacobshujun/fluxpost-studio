# Verification

Last updated: 2026-06-29

## Baseline Command

Run from the project root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1
```

## Current Automated Checks

`scripts/harness/check.ps1` currently verifies:

- Harness file existence and feature-state validity through `scripts/harness/init.ps1`.
- Harness context budgets and `HARNESS-LATEST` marker sizes.
- Handoff validity through `scripts/harness/handoff.ps1`.
- JSON parse checks for project JSON, `docs/harness/feature_list.json`, and existing legacy `data/*.json`.
- Static/domain Harness checks for PostgreSQL schema, workspace accounts, execution logs, platform request mapping, media handling, video download fallback, video-frame policy, video transcription wiring, concurrency, Feishu publish/resume/queue/vehicle-option paths, simple-run policies, simple viral mode wiring and viral replication regressions, source safety, source import retirement, Feishu content import, durable distribution audit queue/progress, Lark task launch, crawl strategy sync, source-link importers, simple queue/persistence, title/image prompt guards, GPT-Image-2 request shape and upstream size constraints, ComfyUI Klein wiring, source tagging image preprocessing, and row-level runtime mutations.
- `npm run lint`.
- `npx --no-install tsc --noEmit`.
- `npm run build`.
- Local production startability smoke on `127.0.0.1:3310` by default, overrideable with `HARNESS_SMOKE_PORT`.
- SQLite store validation through `node scripts/harness/db_check.mjs`.

The baseline must not call live TikHub, OpenAI-compatible text/image services, image providers, ComfyUI, Feishu writes, Lark replies, or simple-run production workflows.

## Manual Smoke Command

When a local server is already running:

```powershell
node scripts/harness/http_smoke.js http://127.0.0.1:3000
```

For the local production server on port `3001`, use the same script with `http://127.0.0.1:3001`.

## Recent Verification

- 2026-06-30: Full baseline passed after adding simple/compact original generation mode. Focused checks included `simple_original_run_check.mjs`, `simple_link_run_check.mjs`, `simple_viral_run_check.mjs`, `simple_queue_check.mjs`, `npx --no-install tsc --noEmit`, `npm run lint`, and `npm run local:restart`; lint still has existing 3 warnings only and build still has existing Turbopack dynamic public-path warnings only.

- 2026-06-29: Full baseline passed after adding manual Feishu vehicle selection in standalone `/review` and the main production review panel. Focused checks included `feishu_vehicle_options_check.mjs`, `npx --no-install tsc --noEmit`, and `npm run lint`; lint still has existing 3 warnings only and build still has existing Turbopack dynamic public-path warnings only.

- 2026-06-26: Full baseline passed after adding same-source video download fallback for restricted Douyin playback URLs. The new local check verifies fallback ordering from a selected `aweme/v1/play` URL to direct CDN `/video/tos/` candidates without calling external services. Focused checks included `video_download_fallback_check.mjs`, `media_request_headers_check.mjs`, `video_quality_selection_check.mjs`, `simple_crawl_media_policy_check.mjs`, `npx --no-install tsc --noEmit`, and `npm run lint`; lint still has existing 3 warnings only and build still has existing Turbopack dynamic public-path warnings only.

- 2026-06-25: Full baseline passed after adding viral source-image style prompt inversion and partial-success handling. Source images are converted through shared model-readable image input, successful visual analyses provide `stylePrompt` to image task prompts, failed image slots are skipped with run metadata, and text-image slots route to the text-image strategy. Focused checks included `viral_replication_regression_check.mjs`, `simple_viral_run_check.mjs`, `source_tagging_image_check.mjs`, `media_cache_image_format_check.mjs`, `npx --no-install tsc --noEmit`, and `npm run lint`; lint still has existing 3 warnings only and build still has existing Turbopack dynamic public-path warnings only.
- 2026-06-25: Full baseline passed after fixing viral replication regressions: Douyin original-sound titles are filtered before rewrite, local material matching no longer injects the target keyword into every asset or reuses one asset for every viral image slot, and local filesystem material paths can become Images API edit references. Focused checks included `viral_replication_regression_check.mjs`, `simple_viral_run_check.mjs`, `image_task_fallback_check.mjs`, `npx --no-install tsc --noEmit`, `npm run lint`, and `npm run local:restart`; baseline still has existing lint warnings and Turbopack dynamic public-path warnings only.
- 2026-06-25: Focused checks passed after moving GPT image size enforcement upstream: user-requested non-`auto` sizes are sent to GPT-Image-2, repeated in the model prompt, and used to prepare image-edit reference uploads on the requested canvas; provider outputs are saved without local post-return resizing. Focused checks included `gpt_image_size_request_check.mjs` and `image_task_fallback_check.mjs`.
- 2026-06-25: Full baseline passed after restoring the requested video transcription flow: cached videos are converted to temporary MP3 files with `ffmpeg`, MP3 files are uploaded to Ark Files with `purpose=user_data`, and Ark Responses receives `input_audio.file_id` plus the explicit audio recognition prompt. Focused checks included `video_transcription_check.mjs` and `npx --no-install tsc --noEmit`; baseline still has existing lint warnings and Turbopack dynamic public-path warnings only.
- 2026-06-24: Full baseline passed after diagnosing latest run `simple-1782296237240`, where video transcription upload to Ark Files ran from `2026-06-24T10:17:27.034Z` to `2026-06-24T10:19:30.500Z` and failed with the generic AbortSignal timeout, matching the previous single 120s Ark timeout during upload. Code now separates `ARK_VIDEO_TRANSCRIPTION_UPLOAD_TIMEOUT_MS` from the Responses/preprocessing wait timeout, logs upload completion before the Responses call, reports upload vs Responses timeout phases explicitly, and polls Ark `processing` file state until the configured deadline. Focused checks included `video_transcription_check.mjs`, `npx --no-install tsc --noEmit`, and full baseline; baseline still has existing lint warnings and Turbopack dynamic public-path warnings only.
- 2026-06-24: Full baseline passed after removing deprecated Ark audio-named transcription config, renaming app config usage to video transcription fields, and adding bounded Ark Responses retry for `403 OperationDenied.InvalidState` when uploaded video file preprocessing is still `processing`. Read-only PostgreSQL diagnosis found latest run `simple-1782295101657` had uploaded a 29.5 MB video for `sourceItemId=douyin-7649916278290955444`, then failed because Responses used the `file_id` before preprocessing finished. Focused checks included no deprecated Ark audio config matches, `video_transcription_check.mjs`, and `npx --no-install tsc --noEmit`; baseline still has existing lint warnings and Turbopack dynamic public-path warnings only.
- 2026-06-24: Full baseline passed after updating Ark video transcription defaults to `doubao-seed-2-1-pro-260628`, adding Ark Files `preprocess_configs[video][fps]` with default `0.3`, changing the default prompt to identify video audio content, and refreshing the local production server on `http://127.0.0.1:3001`. Focused checks included `video_transcription_check.mjs`, `npx --no-install tsc --noEmit`, full baseline, and `npm run local:restart`; baseline still has existing lint warnings and Turbopack dynamic public-path warnings only.
- 2026-06-24: Full baseline passed after switching video transcription from ffmpeg-extracted audio to direct cached-video upload through Ark Files plus Ark Responses `input_video.file_id`. Focused checks included `video_transcription_check.mjs` and `npx --no-install tsc --noEmit`; baseline still has existing lint warnings and Turbopack dynamic public-path warnings only.
- 2026-06-17: Full baseline passed after final generated-image size normalization. Focused checks: `image_task_fallback_check.mjs`, `npx --no-install tsc --noEmit`, `npm run lint`, and a local ffmpeg `1086x1448` to `1024x1536` normalization smoke.
- 2026-06-16: Full baseline passed after the Dongchedi simple link-mode article/comment selection fix. Focused checks included `dongchedi_import_check.mjs`, `link_import_check.mjs`, `simple_link_run_check.mjs`, and `source_import_feishu_check.mjs`.

## Missing Coverage

- No unit test script is defined in `package.json`.
- No isolated live TikHub, OpenAI-compatible, image-provider, ComfyUI, Feishu, or Lark integration test is part of the default baseline.
- No default end-to-end test posts to `POST /api/simple/runs`, because that workflow can call external providers and Feishu publishing.
- No browser UI walkthrough is part of the baseline.
- No live PostgreSQL service migration or multi-user concurrency test is part of the default baseline.
- `ffmpeg` availability is verified for image-edit reference canvas preparation, but real video frame extraction is not verified by default.

## Future Check Rules

- Add new baseline checks only when they are deterministic, local, and do not mutate production/runtime data.
- If a check needs live external services, document it as a manual verification target instead of adding it to the default baseline.
- Keep recent verification to the latest 5 entries. Move older verification history to `docs/harness/archive/verification-history.md` or monthly archive files.

## History

- Full pre-migration verification history is preserved at `docs/harness/archive/verification-history.md`.
