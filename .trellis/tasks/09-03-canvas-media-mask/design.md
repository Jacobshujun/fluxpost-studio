# Canvas Media Mask Node Design

## Architecture

Add a typed `utility.media-mask` node across the existing Canvas layers:

- `src/lib/canvas/types.ts`: node type, config value types, and mask contracts.
- `src/lib/canvas/registry.ts`: ports, defaults, field metadata, and config validation.
- `src/lib/canvas/executors.ts`: dispatch by artifact kind and return typed derived references.
- `src/lib/canvas/media-tools.ts`: image/video materialization, FFmpeg filter construction, deterministic output persistence, and cleanup.
- Canvas inspector components: render the node fields and interactive preview using the existing node-field/editor conventions.
- `.trellis/verification/`: isolated contract and media fixture checks.

No new database table or external service is needed. Existing workflow/run JSON snapshots already persist node config and frozen media inputs.

## Config Contract

Use a versioned, JSON-safe config:

```ts
type CanvasMaskRegion = {
  id: string;
  shape: "rectangle" | "rounded-rectangle";
  mode: "solid" | "blur" | "mosaic" | "image";
  x: number; y: number; width: number; height: number;
  opacity: number;
  color: string;
  imageUrl?: string;
  startMs?: number; endMs?: number;
  radius?: number;
  feather?: number;
  keyframes?: Array<{ timeMs: number; x: number; y: number; width: number; height: number }>;
};

type CanvasMediaMaskConfig = {
  protocolVersion: 1;
  regions: CanvasMaskRegion[];
  itemOverrides?: Record<string, CanvasMaskRegion[]>;
};
```

Coordinates and dimensions are normalized to `[0, 1]`. Validation clamps nothing silently: malformed values, overlapping/descending keyframe times, invalid interval bounds, unsupported colors or missing image overlays fail before execution.

## Execution Data Flow

1. Executor receives exactly one artifact kind (`images` or `videos`) and a frozen config.
2. Normalize and validate config once at the execution boundary.
3. For each item, resolve its override or default regions and compute a fingerprint from source identity, media kind, and normalized config.
4. Return an existing `/generated/canvas-tools/<fingerprint>.*` output when present.
5. Otherwise materialize the source and optional overlay image, run an allow-listed FFmpeg argument array, persist the staged output atomically, and return metadata copied from the source plus derived output details.
6. Always clean temporary materialized files; preserve source references and never report the source URL as a successful masked output.

## FFmpeg Mapping

- Solid rectangle: `drawbox` with normalized-to-pixel coordinates and alpha color.
- Rounded rectangle: generate a transparent PNG/SVG mask with the configured radius and composite it with `overlay`; if the selected mode is solid, the generated layer is sufficient.
- Blur: crop the region, apply `boxblur`, and overlay it back; use `enable='between(t,start,end)'` for video intervals.
- Mosaic: crop, scale down to a bounded grid, scale back with nearest-neighbor, and overlay.
- Image overlay: materialize the overlay image, scale it to the region, apply opacity, and overlay.
- Video output maps the source audio stream, preserves source duration, encodes H.264/AAC with `yuv420p` and `+faststart`, and uses the `localVideo` pool.
- Image output preserves source dimensions and emits JPEG/PNG according to the existing media-tool format policy.

Keyframe regions are converted to time-varying expressions or deterministic segmented filters. The implementation must reject unsupported combinations rather than silently approximate them.

## UX And Compatibility

The inspector uses existing Canvas field rendering and adds a compact region editor. A preview overlay uses normalized coordinates and is bounded by the media aspect ratio. Numeric controls remain available for keyboard precision. Video-only controls (intervals and keyframes) are hidden for image inputs. Existing graphs deserialize unchanged; absent config becomes protocol version 1 with an empty region list and fails neutrally until a region is added.

## Risks And Rollback

- FFmpeg filter availability varies. Preflight the required filters and return a `needs_config`/failed node error when unavailable.
- Blur/mosaic filter graphs can be expensive for long videos; rely on `localVideo` concurrency and existing encode timeouts.
- Cached outputs are content-addressed by source and config, so rollback is code-only and does not invalidate original media.
- If the interactive preview cannot be completed without broad Canvas refactoring, retain numeric controls and a static preview as the MVP fallback; do not alter unrelated node editors.
