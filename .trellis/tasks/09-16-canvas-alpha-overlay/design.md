# Design

- Add optional images port overlayImages to utility.media-mask. Keep base-media ports separate.
- Add optional region imageSource (url/input); absence means URL for existing workflows.
- Required-input calculation includes overlayImages for any input-sourced image region,
  including itemOverrides. Draft persistence remains permissive.
- Executor validates template cardinality and forwards one CanvasMediaReference.
- Renderer materializes the reference through existing local/runtime media helpers,
  hashes template bytes for cache identity and keeps RGBA through opacity multiplication.
- Editor creates full-frame input-sourced image regions and exposes source selection.
- Existing region ordering, geometry, timing, encoding and URL modes remain in use.
- Tests use isolated temp storage and mock persistence; no live providers or runtime writes.
