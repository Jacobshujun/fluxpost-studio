# Verification — 2026-09-14

## Result

- Ordinary ToAPIs 2.5 flare/sunburst use the supplied documented JSON fields, fixed high quality, n=1, reference_images and optional transparent background. Excess counts fail before submission without retry/failover. image_urls remains an older-model field; the 2.5 documentation also accepts it as an alias.
- Canvas and simple mode permit 1:1, 4:3 and 3:4 at 4K; resolution changes preserve ratio. Shared pixel projection matches all fifteen documented ratio/tier examples and all listed ratios satisfy 16-pixel alignment, 3840 edge and 8,294,400 pixel limits. Square 4K is 2880x2880; 2048x2048 is the 2K square example.
- Existing accepted-task resume/polling and older-model request contracts are preserved. No new provider requests were made.

## Evidence

- Passed `node .trellis/verification/toapis_image_api_check.mjs`, `node .trellis/verification/simple_image_dimensions_check.mjs`, `node .trellis/verification/image_background_check.mjs`, `node .trellis/verification/image_provider_profiles_check.mjs` and `npx --no-install tsc --noEmit`.
- Full `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` passed with TRELLIS_SMOKE_PORT=45678. Log: `.tmp-toapis-image-25-baseline.log`. Includes lint (0 errors, 17 warnings), types, build, isolated HTTP/SQLite smoke and all offline contracts.
- `python -X utf8 .trellis/verification/simple_image_dimensions_browser_check.py` passed at 1440px and 390px against the worker-disabled isolated build on port 45678. API requests intercepted; no generation calls. Covers Canvas ratio preservation through 4K changes and reload, simple-mode selection/save/reload/launch capture, and layout. Screenshots: `test-artifacts/canvas-image-dimensions-{1440,390}.png`, `test-artifacts/simple-image-dimensions-{1440,390}.png`.
- `git diff --check` passed. No production configuration, runtime user records, provider credentials, or generated media are included in the change.

## Limits and next step

- Before release, port 3001 ran 40140f9642c9a7183404dc73ba9bee80515ea558 on 0.0.0.0. It uses lingsuan.org/openai_sse, so the corrected ToAPIs body applies only when a ToAPIs route is selected; shared ratio/pixel corrections also apply to SSE.
- Ordinary ToAPIs 2.5 has no documented output_format/output_compression controls; its output bytes are preserved as returned. Existing UI format choices do not control this provider. VIP/Official contracts, external acceptance, and UI provider-capability presentation are outside this change.
- On 2026-09-14 the user approved committing these changes and updating port 3001. Release through `npm run local:lan` to preserve the existing binding, then require clean HEAD, /api/version, candidate state and active-slot manifest to agree. No GitHub push or remote deployment was requested.
