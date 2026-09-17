# Design

LayerSource gains an optional upstream node/port binding, independent of the current
content key. A shared helper annotates composition input media only when a connected
output contains exactly one item. Both the editor and runtime input collection use
it. Resolution of bound layers requires a unique matching binding; legacy and
multi-item selections continue to use content identity. Binding never bypasses
the renderer's byte/hash check. Metadata and source deduplication include binding.

Selecting replacement media preserves existing crop and geometry. Clipboard copies
remap copied upstream node IDs. Old disconnected bindings remain unresolved.
No automatic inference or runtime data migration is performed for old URL-only
selections; the editor's explicit replacement action upgrades them once.
