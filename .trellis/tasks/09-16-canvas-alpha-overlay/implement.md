# Implementation

- [x] Types, registry, required ports, executor, renderer and editor.
- [x] Contracts, real FFmpeg alpha/cache/timing tests and browser workflow checks.
- [x] Full baseline and complete diff review.
- [ ] Update task evidence/status, commit and archive.
- [ ] Activate clean HEAD with npm run local and verify /api/version.

Commands: node .trellis/verification/canvas_media_mask_check.mjs;
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
(TRELLIS_SMOKE_PORT=45678). Browser checks use isolated worker-disabled smoke.
