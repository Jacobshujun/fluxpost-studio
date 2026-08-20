# Canvas Video Subtitle Node Design

## Architecture

Register `utility.video-subtitles@1` in the browser-safe Canvas registry and map it to a server executor. Keep timeline recognition, normalization, ASS generation, font discovery, caching, and encoding in focused `src/lib/canvas` modules. The page owns only node-specific controls, preview state, and preset API calls.

The executor resolves exactly one media reference, materializes it, probes duration/audio, obtains a cached or newly recognized timeline, generates an ASS file, and encodes through the existing `localVideo` pool. Output media uses the existing runtime media persistence boundary.

## Contracts

- `CanvasSubtitleSegment = { startMs: number; endMs: number; text: string }`.
- `CanvasSubtitleStyle` carries the complete reproducible node style snapshot.
- `CanvasSubtitlePreset` carries owner metadata, normalized name, revision, style, and timestamps.
- The node stores style fields directly in `CanvasNode.config`; no live preset id is needed for execution.
- Timeline cache identity includes owner, SHA-256 video bytes, Ark model, prompt hash, and protocol version. Encoded output identity additionally includes validated segments, style, source metadata, and encoding version.

## Persistence And API

Add equivalent PostgreSQL/SQLite `canvas_subtitle_presets` and `canvas_subtitle_transcript_cache` tables. Preset writes use owner/id/revision checks; admins reuse existing workspace ownership helpers for cross-owner access. Cache rows are private implementation data and have no browser API.

`GET|POST /api/canvas/subtitle-presets` lists/creates presets and returns built-ins plus discovered fonts. `PATCH|DELETE /api/canvas/subtitle-presets/[id]` updates/deletes accessible stored presets. Routes stay thin and require workspace authentication.

## Recognition And Rendering

Refactor Ark audio extraction/upload/Responses primitives so the current plain transcript and new timeline request share transport behavior without changing the existing public result. The timeline prompt requires JSON-only millisecond segments; normalization rejects malformed, empty, overlapping, unordered, or out-of-range results.

Generate UTF-8 ASS with explicit PlayRes dimensions, validated style values, escaped control characters, and local line wrapping. Use libass rendering and the selected installed font. Encode video with `libx264`, audio with AAC 192 kbps, `yuv420p`, `+faststart`, and an atomic staging rename.

## UI

Use a dedicated inspector editor rather than expanding the generic field renderer. Present compact semantic controls: font select, color swatches, sliders/number inputs, toggles, segmented alignment/position commands, and preset load/save/delete actions. A fixed-ratio preview stage renders representative subtitle text over a neutral video-like frame using the same normalized style calculations.

The Canvas node result uses the existing model result surface for video and adds the extracted text preview. Loading a preset writes all style fields into the node snapshot and marks the workflow dirty.

## Compatibility And Failure

- Existing nodes/workflows require no migration; the new union member is additive.
- The node may bypass its input video through its video output.
- Missing provider/media/font capabilities become `CanvasNeedsConfigError`; invalid input or provider output becomes a normal node failure.
- No failed timeline is cached and no un-subtitled video is returned as success.
- System fonts are runtime-dependent. Docker installs fontconfig and a Chinese font package; local Windows discovery reads installed font registrations/known font paths.
