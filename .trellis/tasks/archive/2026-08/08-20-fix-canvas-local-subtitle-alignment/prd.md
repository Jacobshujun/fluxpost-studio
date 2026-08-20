# Fix Canvas Local Subtitle Alignment And Resolution Preview

## Goal

Make the Canvas video-subtitle node derive accurate speech timing from local acoustic recognition and make its editor preview use the same effective video dimensions as final ASS rendering.

## Background

- A real `1280x720`, `16.136s` Canvas subtitle run completed after boundary clipping but its Ark-generated segments did not follow the observed speech boundaries.
- The current editor always previews at `16:9` and does not show the upstream video resolution.
- Current media probing exposes coded width and height but not stream rotation or time origins. FFmpeg may autorotate final video while ASS is authored against unrotated dimensions.
- Local validation confirmed `faster-whisper==1.2.1`, CPU int8 support, and a cached `Systran/faster-whisper-small` model.

## Requirements

- Replace Ark-generated Canvas subtitle timing with local Faster Whisper acoustic timing. Existing crawl/simple-run Ark plain-text transcription remains unchanged.
- Use automatic language recognition, transcription without translation, VAD, word timestamps, CPU/int8 defaults, and first/last valid word bounds for each emitted segment.
- Run the local recognizer through a version-controlled Python entry point. Node owns timeout, JSON validation, sanitized errors, and shared `localVideo` concurrency.
- Upgrade the Canvas subtitle timeline protocol to v3. Cache identity includes owner, video hash, engine, model, inference settings, and protocol version; v1/v2 Ark cache rows must not be reused.
- Probe format/video/audio start times and rotation. Width and height in Canvas media references must mean effective displayed dimensions; swap coded dimensions for 90/270 degree rotation.
- Map audio-relative recognition timestamps onto media time using the audio-stream and format/video time origins. Keep integer, positive, ordered, non-overlapping, in-duration segments; only the final segment may be clipped for at most 100ms of rounding drift.
- Generate ASS and output metadata from the same effective dimensions used by the editor. Preserve source orientation, relative stream timing, video duration, and audio content in H.264/AAC MP4 output.
- Resolve subtitle preview media from the current node input, latest successful run, or direct upstream video snapshot. Display effective resolution, aspect ratio, and duration.
- Render the actual video behind the live subtitle overlay at its effective aspect ratio. Correct stale dimensions from browser metadata without writing a separate editable resolution config.
- Missing Python/Faster Whisper/model, invalid recognizer output, no speech, unavailable media/font/FFmpeg, and time-boundary failures must surface explicitly; do not silently fall back to Ark.
- Keep subtitle preset APIs and `utility.video-subtitles@1` workflow config compatible. No database schema migration is required.

## Acceptance Criteria

- [ ] The local recognizer produces validated acoustic segments for the recent real video without exposing its subtitle text in verification evidence.
- [ ] A model/config/protocol change invalidates the subtitle cache; old Ark timelines and encoded output fingerprints are not reused.
- [ ] Standard landscape, portrait, and rotation-metadata fixtures report correct displayed dimensions and generate ASS/output with those dimensions.
- [ ] Nonzero stream origins are mapped correctly and invalid/overlapping/out-of-range recognizer segments fail deterministically.
- [ ] The Canvas editor shows `width x height`, aspect ratio, and duration, and its preview geometry follows actual landscape/portrait media on desktop and mobile.
- [ ] Existing Ark plain-text video transcription remains operational and no live paid provider is called by default checks.
- [ ] Focused checks, TypeScript, lint, production build, and the complete Trellis baseline pass.
- [ ] The verified changes are committed and the clean commit is activated at `http://127.0.0.1:3001` with matching `/api/version` identity.

## Out Of Scope

- Pushing GitHub, production deployment, subtitle text/timeline editing, translation, soft subtitles, OCR, embedded subtitle reuse, or migration of historical generated videos.
