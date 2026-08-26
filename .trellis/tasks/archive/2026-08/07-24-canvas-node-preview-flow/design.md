# Canvas Node Editing And Preview Polish Design

## UI State And Data Flow

Keep all behavior in the route-local canvas page. Build a memoized map of the highest-attempt `CanvasNodeRun` for each node in `activeRun`, then provide config updates, selection, run metadata, and preview commands through a route-local React context consumed by `CanvasFlowNode`.

Persist only `CanvasNode.config` through the existing graph serializer. Run output remains server-owned and read-only in the UI.

When `loadRuns` receives records for the active workflow, fetch the newest run detail unless the user has explicitly selected another run. `refreshRun` remains the single setter for `activeRun`, so polling, run selection, and retry use one projection path.

## Text Editing

`input.text` renders a controlled textarea bound to `config.text`. Apply React Flow's `nodrag`, `nopan`, and `nowheel` classes and stop key/pointer propagation where needed while preserving native textarea behavior. Focusing the editor selects the node. The existing update function marks the graph dirty and the existing debounce persists it.

## Model Result Preview

Only model nodes render inline run state. The latest attempt controls status and output. If the run revision differs from the current workflow revision, show a historical-result label.

- Text: four-line whitespace-preserving excerpt; full dialog exposes the complete value and a copy button.
- Images: fixed 1-4 tile gallery with overflow count; each tile opens the existing zoomable image dialog.
- Videos: compact native video controls with canvas gestures disabled; an explicit preview button opens a larger video dialog.
- Missing output: show a compact empty message only when the node attempt completed without a previewable artifact.
- Failure states: show the status and a clipped error summary; retry stays in the run dock.

Use a discriminated preview state for text, image, and video. Reuse the existing image dialog and add route-local text/video dialogs with shared backdrop geometry and explicit close controls.

## Flowing Edge

Render two SVG paths from the existing Bezier geometry:

1. A continuous base path colored from `--canvas-edge-color`.
2. A highlight path with `pathLength=100` and one `14 86` segment animated across the path in about 1.8 seconds.

Derive a deterministic negative animation delay from the edge id so multiple lines do not pulse in lockstep. Selection increases contrast and width. Reduced-motion hides the highlight and leaves the base path intact.

## Compatibility And Safety

- No API, database, graph, artifact, or provider changes.
- Existing image input galleries and the bottom run dock retain their behavior.
- Mocked verification only; do not submit model or Feishu work.
- Keep all new controls semantic and keyboard accessible.
