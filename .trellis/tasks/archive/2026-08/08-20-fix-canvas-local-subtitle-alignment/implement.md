# Canvas Local Subtitle Alignment Implementation

## Ordered Work

- [x] Extend deterministic subtitle checks first for v3 local recognition, shifted timing, strict bounds, rotated media dimensions, ASS/output metadata, and editor preview contracts; confirm they fail on current code.
- [x] Add the locked Python requirement and Faster Whisper JSON entry point.
- [x] Add Canvas subtitle runtime configuration and Node process/normalization boundary while preserving Ark plain-text transcription.
- [x] Expand shared FFprobe metadata and propagate effective displayed dimensions through upload, subtitle cache, ASS, output fingerprints, and results.
- [x] Resolve inspector input media and implement actual-video, aspect-ratio-aware subtitle preview with resolution/aspect/duration metadata.
- [x] Add/extend desktop and mobile mocked browser verification.
- [x] Run the focused checks and a privacy-safe real local video timing comparison.
- [x] Run TypeScript, lint, build, and the complete Trellis baseline.
- [x] Update FluxPost status/feature/verification evidence, finish/archive the task, and commit all verified changes.
- [ ] Run `npm run local`; verify port 3001 health and exact final commit identity.

## Verification

```powershell
node .trellis/verification/canvas_video_subtitles_check.mjs
python .trellis/verification/canvas_video_subtitles_browser_check.py
npx --no-install tsc --noEmit
npm run lint
npm run build
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
npm run local
```

Default checks must use generated local fixtures and must not call Ark, TikHub, OpenAI-compatible providers, Feishu, or production services.

## Risk And Rollback

- Recognition can be CPU-intensive; serialize it with `localVideo`, use an explicit timeout, and keep the default small/int8 model.
- Rotation and stream-origin handling must be proven with FFmpeg fixtures before changing persisted media semantics.
- Do not mutate runtime subtitle cache rows or generated media during implementation. New v3 keys and fingerprints leave old data intact.
- Do not run the candidate update until every source/Trellis change is committed and the worktree is clean.
