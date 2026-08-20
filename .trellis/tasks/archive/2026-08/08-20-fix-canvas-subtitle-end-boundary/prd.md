# 修复 Canvas 字幕末段时间越界

## Goal

Allow a real Canvas video-subtitle run to finish when Ark returns a small end-time overshoot on the final subtitle segment, without weakening validation for malformed timelines.

## Background

- Local run `canvas-run-1787207100180-da7446c1`, started on 2026-08-20 at 14:25 Asia/Shanghai, failed in `utility.video-subtitles` with `Subtitle segment 7 timing is outside the video duration.`
- The selected video snapshot and runtime FFprobe result both reported `16.136009` seconds, so the failure was not stale Canvas metadata.
- `src/lib/video-transcription.ts` sends an extracted MP3 to Ark but does not include the exact source duration in the subtitle prompt. The returned timeline is then validated with zero end-boundary tolerance.
- The failure occurred before ASS generation and FFmpeg rendering. Upload, queue, database, audio extraction, Ark file upload, font checks, and FFmpeg capability checks were not the failing stage.

## Requirements

- Append the exact allowed media duration in integer milliseconds to the Ark subtitle request prompt for each request.
- Keep the configured base prompt unchanged in configuration and cache hashing; the request-specific duration constraint must be derived at call time.
- Preserve strict validation for integer timing, non-negative starts, positive segment duration, ordering, non-overlap, non-empty text, and text length.
- Permit correction only when the final segment ends no more than `1000ms` after the probed media duration, its start remains before the media end, and clipping preserves positive duration.
- Clip an eligible final `endMs` to the probed duration. Reject intermediate-segment overflow, final starts at or beyond the media end, and overflow greater than `1000ms`.
- Increase the subtitle timeline protocol version so previous cache identity cannot be confused with the corrected contract.
- Failure diagnostics must include the segment number and timing boundary values without logging subtitle text, media URLs, credentials, or provider payloads.
- Do not automatically retry Ark or mutate the failed runtime task during implementation.

## Acceptance Criteria

- [x] Ark receives the configured subtitle prompt plus the exact `durationMs` upper bound.
- [x] A final segment ending within `1000ms` beyond the media duration is clipped and accepted.
- [x] A valid timeline remains unchanged.
- [x] Intermediate overflow, excessive final overflow, and a final start at or after the media end still fail explicitly.
- [x] The subtitle timeline protocol version changes from `1` to `2`.
- [x] Focused subtitle verification covers the request prompt and all boundary cases without a live Ark call.
- [x] TypeScript, lint, build, and the complete offline Trellis baseline pass without external provider calls.

## Out Of Scope

- Retrying or editing the operator's failed Canvas run.
- Calling live Ark to reproduce or validate the fix.
- Changing subtitle style, preset, FFmpeg, font, upload, or Canvas UI behavior.
- Persisting raw Ark subtitle responses.
