# Verification

- Host RTX 5880 Ada, NVIDIA driver 582.08 and FFmpeg h264_nvenc verified using an actual encode.
- Explicit local `FFMPEG_VIDEO_ENCODER=h264_nvenc` persisted through the existing configuration writer; no credentials exposed or committed.
- Real CPU/NVENC filtered MP4 output passes codec, dimensions, duration, AAC audio, encoder receipt and decode validation.
- Real video reconstruction passes under CPU and NVENC. Opt-in actual layer composition/slideshow passes NVENC receipt/audio checks; tiny unsupported dimensions fail explicitly with the root error retained.
- Real video masking at 320x180 passes NVENC encoder receipt, AAC audio and full decode checks.
- CPU mask, layer, subtitles/editor, video-loader/workflow and configuration tests pass in the deterministic baseline. Config persistence/reload/invalid-value/clear behavior covered.
- Full baseline runs all deterministic checks, then stops at the existing 17 lint errors in ignored data/feishu-copy-import scripts. No checks weakened. Source lint, types, final production build, isolated HTTP smoke, built-config synchronization and SQLite store pass. Local config resolves h264_nvenc and localVideo concurrency 1. Clean commit/activation pending.

No live provider, TOS, Feishu or user workflow mutation was used for verification. Video worker concurrency stays at its existing value; decode/filters/audio remain CPU. Cached outputs are preserved. See canvas_video_encoding.md for unsupported tiny dimensions and explicit CPU selection.

After implementation commit b722ce3, a new 20-item runtime schedule was observed. User explicitly chose to finish that batch before activation. Keep the existing listener until its execution/queue drain; do not cancel or interrupt it for this change.
