# Technical Design

## Boundary

Keep node size as optional visual metadata on `CanvasNode`, for example `size?: { width: number; height: number }`. This keeps layout with position in the existing graph JSON while leaving node config and execution semantics unchanged. No database migration or route-specific DTO is needed because Canvas workflows already persist and snapshot the typed graph.

## Data Flow

1. `toFlowNode` maps persisted `CanvasNode.size` to React Flow `width` and `height`.
2. `NodeResizer` renders only for the selected node on editable desktop canvas.
3. React Flow dimension changes update the local `FlowNode`; the existing `onNodesChange` dirty path schedules autosave.
4. `currentGraph` writes finite measured dimensions back to `CanvasNode.size` only when a custom size exists, preserving legacy content-driven nodes.
5. Workflow graph validation and clipboard parsing accept only finite dimensions within the shared bounds.
6. Copy/paste and workflow duplication preserve size automatically through `structuredClone`.

## UI Behavior

- Use the library `NodeResizer` rather than custom pointer math.
- Allow independent width and height changes (`keepAspectRatio={false}`).
- Show four resize lines and four corner handles only while selected on desktop.
- Keep resize controls above node chrome, use the node accent color, and give the handles stable hit targets without visually heavy decoration.
- Make the node root fill React Flow's assigned dimensions. Node body uses a column layout; content/result areas consume available space and scroll internally when necessary. Ports remain visible at the bottom.
- Existing inner controls retain `nodrag nopan nowheel` isolation.

## Compatibility And Validation

- `size` is optional, so existing saved workflows continue to render with the current `220px` desktop and `190px` mobile defaults.
- Persisted size is layout metadata only and must not participate in execution fingerprints or node configuration validation.
- Shared constants define `190x120` minimum and `720x900` maximum so graph validation, clipboard validation, UI constraints, and tests cannot drift.
- Malformed saved graphs fail the existing graph validation path. Malformed clipboard envelopes remain ignored as today.
- Mobile filters non-selection node changes and does not mount the resizer.

## Rollback

Removing the optional `size` mapping and `NodeResizer` restores current behavior. Existing JSON containing optional size remains harmless if the UI stops consuming it; no schema rollback is required.
