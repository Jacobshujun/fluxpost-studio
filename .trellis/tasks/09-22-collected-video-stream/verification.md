# Verification — 2026-09-22

- Read-only incident inspection: the latest video-processing run failed in media-mask with no valid video stream. FFprobe on the saved media found AAC audio only. The normalized source selected a Douyin DASH play URL.
- Replaying that existing raw response with the patched parser selects a non-DASH primary and yields 36 candidates with zero known separate-track paths. No TikHub calls or runtime writes.
- `node .trellis/verification/video_quality_selection_check.mjs`: PASS, including split-track ranking, metadata/duplicate rejection and generic extraction.
- `node .trellis/verification/video_download_fallback_check.mjs`: PASS with real FFmpeg-generated audio-only/silent-video files and a loopback HTTP fixture; rejects audio, continues to video, repairs local/durable invalid cache and overwrites durable stale bytes. No external writes.
- Standard `.trellis/verification/check.ps1`: all domain contracts PASS; stops at existing `data/feishu-copy-import/` CommonJS lint failures (17 errors). Source was initially clean and those files were not modified. The initial context-budget failure was resolved by shortening old status summaries without dropping their evidence links.
- `npm run lint -- --ignore-pattern 'data/**'`: PASS, 0 errors / 17 existing warnings.
- `npx --no-install tsc --noEmit` and `npm run build`: PASS.
- Remaining baseline functions were executed unchanged from `check.mjs`: built-config synchronization, isolated worker-disabled port-45678 HTTP smoke and SQLite store checks all PASS. Full baseline remains recorded as blocked, not green.
- `git diff --check`: PASS.

## Delivery

Port 3001 was not restarted: read-only diagnostics showed active Canvas work (60 running queue entries and 8 queued at inspection). No workflow rerun, paid provider request, publishing action, source-item edit or TOS write was performed.

After safe activation of the committed candidate, re-collect the affected source to replace the invalid cached media. Full workflow reruns can publish and must remain an explicit operator action.
