# Canvas Common Nodes Design

## Contracts

Extend `CanvasNodeType` with eight version-1 values and `CanvasConfigFieldDefinition.kind` with browser-only content-pool and library picker fields. Keep `CanvasArtifactKind`, persistence schema, workflow/run APIs, and flat node config unchanged.

Content snapshots store source id, captured timestamp, title/body/source URL, and ordered image/video URLs. Library snapshots store asset ids, names, captured timestamp, and ordered URLs. Executors only project stored values into artifacts, preserving immutable graph semantics.

## Node Execution

- Template and split executors are pure text transforms. Template inputs follow persisted edge/artifact order.
- GPT vision uses a shared OpenAI-compatible multimodal text helper rather than duplicating provider request parsing. It returns `needs_config` when the text provider is unavailable and uses the existing GPT pool.
- Image selection flattens incoming image artifacts in stable edge/item order and projects validated 1-based indices.
- Image transformation materializes each URL, enforces limits, processes it with a direct image dependency, and persists a content-addressed output under canvas-generated media.
- Video framing materializes each input, obtains duration with ffprobe where required, executes ffmpeg with an argument array, and persists content-addressed JPEG frames. Missing binaries return an actionable configuration error.

Local deterministic nodes may be safely rerun. Output paths are derived from normalized inputs and config so retrying identical work is idempotent and isolated-run fingerprints remain meaningful.

## UI

The existing inspector renders new picker fields with owner-scoped `/api/content-pool` and `/api/library/assets` reads. Picker selection writes complete flat snapshots; refresh replaces them only after an explicit command. Snapshot output ports remain available even when the original record later disappears, while the inspector shows that refresh is unavailable.

A root-level quick-add popover opens at the canvas coordinate from empty-space context menu, Tab, or a connection drop. Search matches localized label, description, type, and category. Connection context includes handle direction, node id, port id, and artifact kind. Candidate rows expose matching port choices when a definition has multiple compatible ports; selection creates the node at the drop point and adds a collision-free typed edge.

## Compatibility And Safety

Existing node versions, stored graphs, run snapshots, clipboard envelopes, and API shapes remain valid. New types are additive. Media fetch/materialization and persistence reuse existing runtime boundaries, with no base64 graph values. Provider confirmation remains capability-driven. All live model, Seedance, Feishu, and TOS probes stay outside deterministic checks.

## Rollback

Removing the eight additive definitions/executors and quick-add UI disables the increment without database rollback. Content-addressed generated media can remain as normal runtime state and is not Trellis context.
