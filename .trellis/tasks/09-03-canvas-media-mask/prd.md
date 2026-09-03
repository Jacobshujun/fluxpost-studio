# Canvas 遮罩媒体节点

## Goal

Provide a Canvas node displayed as "遮罩" that lets an operator define one or more regions over images or videos and emits reusable derived media for platform watermarks, account marks, subtitle bars, or brand overlays.

## Background And Confirmed Facts

- Canvas already has typed node definitions, a registry, unified image/video media references, node executors, and FFmpeg-based derived-media tools.
- Image and video outputs use `CanvasMediaReference` and `CanvasArtifact`; local video encoding uses the shared `localVideo` concurrency pool.
- Canvas runs freeze inputs and node configuration; execution must not reread mutable drafts or external media records.
- Derived media belongs under the existing `/generated/canvas-tools/` runtime media path; the database stores references and metadata, not media bytes.
- Original input media must remain available. A mask output must never overwrite its source URL.

## Requirements

### R1. Node contract

- Add `utility.media-mask`, displayed as "遮罩".
- Accept either an `images` input or a `videos` input and emit the matching artifact kind.
- Reject runs with neither input or with both input kinds connected; do not silently convert media types.
- Support multiple input items within existing media-count limits and preserve input order.

### R2. User-defined mask configuration

- Support one or more mask regions with normalized coordinates (`x`, `y`, `width`, `height` in the `0..1` range), opacity, and optional start/end time for videos.
- The first version supports only `rectangle` and `rounded-rectangle` regions. Polygon, brush, and automatic tracking are not part of this task.
- Support deterministic modes: solid color, blur, mosaic, and image overlay.
- Allow a default region configuration and per-item overrides for batch inputs.
- For videos, allow position keyframes and interpolate region position/size between keyframes. A region without keyframes remains fixed for its interval.
- Invalid regions, time ranges, opacity, colors, overlay references, or keyframe order must fail validation before media processing.

### R3. Media processing

- Images render configured masks while preserving dimensions and a valid browser-readable image format unless an explicit transform is configured elsewhere.
- Videos preserve source duration and audio by default, apply masks only inside configured intervals, and produce a browser-readable MP4.
- Processing uses allow-listed `execFile` argument arrays and the shared local media concurrency pool; node config must never become shell text.
- Output identity includes source identity and the complete normalized mask configuration so repeated runs reuse deterministic cached output.
- Processing failures surface as failed node results with actionable errors; the unmodified source must not be returned as a successful masked output.

### R4. Canvas UX

- The inspector exposes preview, region list, add/remove controls, numeric position/size controls, mode-specific controls, and video interval controls.
- The preview lets users select and adjust a region while keeping controls within responsive desktop/mobile bounds.
- Original and masked previews are distinguishable before a run is accepted.
- The node shows a neutral empty/invalid state when no compatible input is connected.

### R5. Persistence and compatibility

- Persist normalized mask configuration in node config and run snapshot; do not introduce a separate mutable global mask store.
- Existing graphs and node types load unchanged; missing mask configuration normalizes to a documented default and does not affect unrelated nodes.
- Output references retain source metadata where applicable and include derived dimensions, MIME type, and duration for downstream nodes.

## Acceptance Criteria

- [ ] Registry, type definitions, validation, and executor expose `utility.media-mask` with typed image/video ports and a stable versioned config.
- [ ] Image fixtures prove solid, blur, mosaic, and image-overlay masks, including multiple regions and cache identity.
- [ ] Video fixtures prove fixed and interval-limited masks, keyframe interpolation, preserved duration/audio, and browser-readable MP4 output.
- [ ] Invalid configuration and incompatible input combinations fail before FFmpeg/provider work with actionable errors.
- [ ] Canvas run snapshots contain frozen input media and normalized mask config; changing the draft after launch cannot change output.
- [ ] Mocked desktop and mobile browser checks cover inspector controls, preview containment, add/remove regions, and no horizontal overflow.
- [ ] TypeScript, lint, production build, isolated HTTP/SQLite smoke, and the complete offline Trellis baseline pass.

## Out Of Scope

- Automatic watermark detection, OCR, logo recognition, or AI inpainting/object removal.
- Freeform polygon masks, brush painting, and automatic motion tracking.
- Replacing or deleting original source media.
- New external storage, provider APIs, or database tables for mask definitions.
