# Canvas local directory and image slideshow

## Goal

Add two owner-scoped Infinite Canvas nodes: a read-only local-directory scanner and a deterministic image-plus-music slideshow renderer. Outputs must remain compatible with existing content assembly, review, Feishu attachment, runtime-media, and V2 scheduling flows.

## Requirements

- `input.local-directory` accepts a server absolute path for signed-in users, scans first-level directories into immutable media-group snapshots, and exposes `images`, `audios`, and `videos` ports.
- Supported formats are JPEG/PNG/WebP, MP3/WAV/M4A/AAC/FLAC, and MP4/MOV/WebM. Natural sort, real-format validation, SHA-256 metadata, limits of 200 groups/250 media per group/5000 files, invalid-group reporting, owner isolation, and revalidation before execution are required.
- The feature is enabled by default only in local/development/candidate; production is disabled unless `CANVAS_LOCAL_DIRECTORY_ENABLED` is true. Exported workflows redact absolute paths, snapshot ids, file lists, and audio selections.
- `utility.image-slideshow` requires 1-250 ordered images and exactly one audio. It supports 1-600 seconds (default 10), four aspect ratios, beat/uniform/none transitions, deterministic mild motion, blurred same-image background, optional static title/body overlays, and explicit overflow validation.
- Render output is 25fps H.264 Main@4.0 yuv420p BT.709, AAC-LC 48kHz stereo, faststart MP4, stored via the existing local-video concurrency and runtime-media paths.
- V2 supports `directory-group` expansion and a directory-to-review preset; each valid group yields an independent GeneratedPost while preserving source images and the rendered video.

## Acceptance Criteria

- [ ] Canvas type contracts, serialization, old-workflow compatibility, and `audios` propagation pass focused checks.
- [ ] Authenticated scan/snapshot/preview APIs enforce owner and environment rules; scan grouping, limits, metadata, invalid groups, revalidation, and export redaction are covered.
- [ ] Directory and slideshow nodes execute end to end with deterministic output, all ratios/transitions, short audio handling, Chinese overlays, and encoding probe checks.
- [ ] V2 expansion creates independent per-group progress/error/retry state and compatible review drafts.
- [ ] Canvas UI exposes scanning, group/music selection, slideshow controls, preview, and template wiring on desktop/mobile without overflow.
- [ ] TypeScript, lint, production build, focused checks, and the full Trellis baseline pass; changes are committed before port 3001 activation.
