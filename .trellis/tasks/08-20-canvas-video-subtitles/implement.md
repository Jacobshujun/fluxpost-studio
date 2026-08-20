# Canvas Video Subtitle Node Implementation

## Ordered Work

- [x] Add subtitle domain types, style normalization/validation, built-in presets, font discovery, and registry/config integration.
- [x] Refactor reusable Ark audio/Responses primitives and add strict timeline recognition plus normalization tests.
- [x] Add owner-scoped timeline cache and preset persistence for PostgreSQL/SQLite, including schema migration and thin authenticated APIs.
- [x] Add ASS generation and atomic FFmpeg hard-subtitle encoding through the existing runtime media and local video pool.
- [x] Wire the Canvas executor, result artifacts, bypass behavior, error mapping, run fingerprints, and scheduler compatibility.
- [x] Build the inspector style editor, static preview, font loading, and preset create/load/overwrite/delete interaction.
- [x] Add deterministic domain/API/media checks and mocked desktop/mobile Canvas browser coverage without live Ark calls.
- [x] Run focused checks, TypeScript, lint, build, and the full Trellis baseline.
- [ ] Update FluxPost status/feature/verification facts, commit the verified candidate, and start the clean port-3001 candidate.

## Verification

```powershell
node .trellis/verification/canvas_video_subtitles_check.mjs
node .trellis/verification/canvas_workflows_check.mjs
npx --no-install tsc --noEmit
npm run lint
npm run build
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

The default baseline must mock Ark and must not write to production services or live runtime data.

## Risk And Rollback

- Keep additive schema and node registration isolated so disabling the new node leaves historical workflows untouched.
- Preserve current `transcribeVideoContent` behavior while extracting shared Ark transport primitives.
- Validate fonts and libass before paid recognition when possible; never silently substitute an unavailable selected font.
- Work with the existing dirty Trellis status/feature/verification changes and do not overwrite unrelated user edits.
