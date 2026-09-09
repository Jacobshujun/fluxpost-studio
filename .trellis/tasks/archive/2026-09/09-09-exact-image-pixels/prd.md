# Enforce exact image pixel dimensions without resizing

## Goal

Honor exact pixel requests without silently translating them to resolution tiers or resizing generated output. User approved this repair direction on 2026-09-09.

## Requirements

- 2026-09-09 follow-up approved: replace the one-click free-form image size input with ratio/resolution dropdowns matching the Canvas GPT image node. Share supported combinations, disallow unsupported 4K ratios, preserve selections through settings and run snapshots/resume, and pass ratio/resolution to all simple image paths. Legacy pixel-only settings require explicit user selection, not silent conversion.
- Preserve exact size values on pixel-capable request paths. Reject exact-pixel requests on the currently ratio/tier-only ToAPIs adapter before reference upload or generation. Explicit ratio/tier and auto requests remain supported.
- Validate returned image bytes before saving or uploading them; mismatched width/height must fail with expected and actual dimensions, without source fallback, retries or resizing.
- Check both URL and base64 outputs, including resumed tasks. Preserve explicit keep-source behavior and ratio/tier Canvas workflows.
- The official ToAPIs documentation fetch returned unrelated UniFi OS HTML, not an API contract. Do not invent native exact-pixel support; the current recorded contract is ratio/tier only. Live provider capability verification remains pending.
- User authorized local commit on 2026-09-09. No paid generation, runtime-data repair, provider switch, push or port-3001 activation is authorized.

## Acceptance Criteria

- [x] Simple mode exposes ratio and 1K/2K/4K selects, rejects unsupported combinations and explains legacy pixel-only settings.
- [x] Selected dimensions survive save/reload/run snapshot/resume and reach reference, viral and original image generation unchanged.
- [x] Focused selection/persistence checks, desktop/mobile mocked browser checks and the full offline baseline pass for the follow-up.
- [x] 1200x1600 is never converted to 3:4 + 1k; unsupported pixel requests fail before generation/upload.
- [x] Exact matching PNG/JPEG output is accepted unchanged; 768x1024, swapped dimensions and corrupt output cannot satisfy a 1200x1600 request.
- [x] Pixel-capable JSON/multipart/Responses paths retain the requested size; explicit ratio/tier and auto remain valid.
- [x] Mocked persistence checks prove mismatched base64/URL results cause no writes or uploads and no source fallback.
- [x] Focused checks and the full offline baseline pass.

## Notes

- Affected code: src/lib/toapis-image-api.ts and src/lib/image-generation.ts. Tests: ToAPIs contract, size request/output and source-fallback checks. Track outcome in Trellis status/feature/verification.
- Implementation order: remove implicit pixel mappings; preflight unsupported requests; validate final bytes using existing sharp dependency before persistence; add isolated regressions; run baseline. No output resampling.
- Review: the user explicitly approved the described four-step repair before task creation. This PRD records that approved scope; no unapproved native API capability is assumed.
- Verification: image_exact_pixels_check.mjs, toapis_image_api_check.mjs, image_task_fallback_check.mjs, image_provider_profiles_check.mjs and gpt_image_size_request_check.mjs pass. The full check.ps1 baseline passes, including lint, TypeScript, build, isolated HTTP smoke and SQLite. Existing lint/build warnings remain. Local commit is user-authorized; archive this verified task with the scoped commit. Local activation and remote push remain unauthorized.
