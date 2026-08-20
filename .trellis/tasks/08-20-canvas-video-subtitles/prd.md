# Canvas Video Subtitle Node

## Goal

Add an Infinite Canvas utility node that automatically recognizes speech from one input video, renders configurable hard subtitles into a compatible MP4, and exposes the extracted subtitle text for downstream nodes.

## Background

- Canvas already persists typed DAG workflows and durable runs, and local video work uses FFmpeg plus the shared `localVideo` concurrency pool.
- Existing Ark video transcription extracts MP3 audio and returns plain text, but the subtitle node requires validated sentence timing.
- Runtime media contains URLs and metadata; binary output remains in the existing runtime media store.

## Requirements

- Add `utility.video-subtitles@1` with exactly one required `videos` input, a hard-subtitle `videos` output, and a plain `text` output.
- Recognize Chinese-first speech through the existing Ark Files and Responses integration using a separate strict timeline prompt. Preserve mixed English and do not translate.
- Accept only ordered, non-overlapping, non-empty `{ startMs, endMs, text }` segments inside the probed video duration. Invalid or empty timelines fail explicitly.
- Reject missing audio, more or fewer than one input video, videos over the existing 512 MB / 600 second limits, missing Ark configuration, unavailable FFmpeg/libass, and unavailable selected fonts.
- Render ASS hard subtitles and emit H.264/AAC `yuv420p` faststart MP4 while preserving source dimensions, duration, frame timing, and audio content.
- Expose font family, size, bold, text/outline colors, outline width, optional background/color/opacity, vertical position, horizontal alignment, vertical margin, and maximum characters per line.
- Preserve Ark sentence timing. Long sentences wrap inside the same segment instead of inventing new timing.
- Show an immediate browser-side static preview for layout/style. Browser font fallback is acceptable when the client lacks the selected server font; final video uses the server font.
- Provide three read-only built-in styles: `白字黑边`, `底部黑底`, and `居中强调`.
- Allow authenticated users to create, load, overwrite after explicit confirmation, and delete named style presets. Loading copies a style snapshot into node config; later preset changes/deletion do not mutate nodes.
- Persist presets by owner with case-insensitive normalized unique names. Operators see/manage their own presets; admins see/manage all presets with owner attribution.
- Cache successful subtitle timelines by owner, video content hash, Ark model, prompt hash, and timeline protocol version. Style-only reruns reuse the timeline and only re-render locally. Failed recognition is not cached.
- Keep current plain-text video transcription behavior unchanged for crawl/simple-run consumers.

## Acceptance Criteria

- [ ] A user can connect exactly one video to the subtitle node, choose a server font, configure common subtitle style controls, and see an immediate static preview.
- [ ] A successful run produces one playable MP4 with hard subtitles plus one ordered plain-text artifact.
- [ ] Changing only style reuses the validated timeline and does not submit another Ark transcription request.
- [ ] Missing audio, no speech, invalid Ark JSON/timing, missing configuration, and missing fonts surface actionable `failed` or `needs_config` node states without passing the original video through.
- [ ] Built-in presets load as snapshots and cannot be changed or deleted; personal presets support create, explicit same-name overwrite, load, and delete.
- [ ] Operator/admin ownership rules, revision conflicts, preset limits, and normalized name conflicts are enforced server-side for PostgreSQL and SQLite.
- [ ] Existing workflows and all existing Canvas nodes remain loadable without migration.
- [ ] Deterministic tests cover contracts, Ark mocks, cache isolation/reuse, ASS generation/encoding, persistence/API permissions, and responsive UI without live provider calls.
- [ ] Focused checks, TypeScript, lint, production build, and the full Trellis baseline pass before completion.

## Out Of Scope

- Editing recognized sentences or timing, OCR of visible subtitles, reuse of embedded subtitle tracks, soft subtitle output, translation, animated/karaoke subtitles, font upload, and multi-video processing.
