# Canvas Local Subtitle Alignment Design

## Architecture

Keep the existing Canvas node and preset surface. Add a small Python boundary that emits JSON acoustic segments from Faster Whisper, while Node remains responsible for configuration, process control, validation, caching, ownership, media materialization, and ASS/FFmpeg output.

`probeCanvasMediaFile` becomes the single media-timeline contract owner. It returns coded dimensions, effective displayed dimensions, rotation, stream/format origins, duration, audio presence, and size. Upload snapshots and generated Canvas media continue storing `width` and `height`, but those values now consistently mean displayed dimensions.

## Timeline Data Flow

1. Materialize the source video and probe effective media metadata.
2. Hash source bytes and resolve a v3 owner-scoped cache key from local recognizer identity/settings.
3. Spawn the configured Python interpreter with the media path and Faster Whisper settings, under the existing `localVideo` pool and explicit timeout.
4. Decode one JSON object from stdout and sanitize stderr/process errors.
5. Shift audio-relative milliseconds by `audioStart - mediaOrigin`, validate against video duration, and persist only successful normalized segments.
6. Build ASS with effective display dimensions and encode a new fingerprinted MP4.

The Python script emits engine output only. It does not know database, Canvas, media URLs, credentials, or ownership.

## UI Data Flow

The page derives one `CanvasMediaReference` for the subtitle inspector from the selected node's latest inputs/results or a direct incoming edge and upstream node snapshot. Browser `loadedmetadata` provides a final displayed-size correction for old records. The editor receives this reference as a narrow prop, shows metadata, and sizes a stable preview stage from its aspect ratio. Node config remains style-only.

## Compatibility And Failure

- Keep `transcribeVideoContent` and Ark transport code for non-Canvas plain-text consumers; remove only Canvas subtitle prompt/model configuration.
- Keep existing cache table and JSON storage. The changed v3 cache identity makes historical rows inert without destructive migration.
- Treat missing interpreter/package/model as `CanvasMediaNeedsConfigError` and therefore `needs_config`; malformed/no-speech/timing errors remain failed runs.
- Keep output duration driven by video, not shortest audio. FFmpeg autorotation is matched by ASS effective dimensions.
- Rollback is code-only: the prior commit can reactivate its separate build slot and historical cache/media remain untouched.
