# Canvas Media Mask

## Scope / Trigger

`utility.media-mask` overlays one static image template on base images or videos.
The optional template is separate from the mutually exclusive base-media inputs.

## Signatures

- Input ports: `images`, `videos`, optional single-connection `overlayImages: images`.
- `CanvasMaskRegion.imageSource?: "url" | "input"`; absence means URL.
- `maskCanvasMedia({ kind, items, config, overlayImage?: CanvasMediaReference })`.
- Existing output ports and mask protocol version 1 remain unchanged.

## Contracts

- The image-template command creates an input-sourced image region at x/y=0,
  width/height=1 and opacity=1, with no time limits.
- Input-source regions use the same single template across all base items.
  Region order controls compositing order; geometry stretches to the region.
- RGBA alpha is multiplied by region opacity, never flattened before compositing.
- The template is materialized once per invocation, and its actual byte SHA-256
  participates in the media-mask-v3 cache key. Cleanup also runs after failure.
- MP4 output retains base dimensions, duration and first audio-track content.
  Existing H.264/AAC encoding remains; output MP4 does not carry alpha.

## Validation & Errors

- Input-sourced image regions, including itemOverrides, require overlayImages
  for execution; incomplete drafts remain saveable/exportable.
- More than one template item produces needs_config; missing template does too.
- URL-source regions still require imageUrl. Invalid imageSource is rejected.
- Corrupt template decoding fails the node and removes staged output.

## Good / Base / Bad Cases

- Good: a 9:16 transparent PNG overlays a matching video, including half-alpha pixels.
- Base: legacy imageUrl-only regions retain their prior behavior.
- Bad: connecting a template to base images while videos is connected remains invalid.

## Tests Required

- `node .trellis/verification/canvas_media_mask_check.mjs`: real FFmpeg pixel,
  timing, geometry, opacity, audio, cache, batch, overrides and failure checks.
- `node .trellis/verification/canvas_workflows_check.mjs`: port validation,
  incomplete drafts and workflow save/export/import round trips.
- `python .trellis/verification/canvas_media_mask_browser_check.py` with
  BROWSER_BASE_URL on worker-disabled loopback smoke, never port 3001:
  desktop pointer wiring, 1440/390 config persistence, layout and video playback.
- Mobile retains the existing read/edit graph behavior; pointer connections are desktop-only.

## Wrong vs Correct

- Wrong: merge overlayImages into base images, flatten PNG to JPEG, or key only
  on the template URL.
- Correct: separate inputs, preserve RGBA through compositing, hash template bytes.
