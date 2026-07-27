# Canvas Node Editing And Preview Polish

## Goal

Make the infinite canvas usable for direct text entry and model-result inspection while replacing the segmented edge animation with a continuous line and a single moving light beam.

## Background

- `input.text` already stores editable text in `CanvasNode.config.text`, but the canvas node renders no editor; the only editor is in the right inspector.
- Model outputs already arrive as typed `CanvasArtifact` values on `CanvasNodeRun.outputs`, but the UI renders them only as small clipped items in the bottom run dock.
- `FlowingCanvasEdge` currently overlays `stroke-dasharray: 2 12`, producing repeated short segments instead of a continuous illuminated path.
- The existing workflow, run, retry, artifact, image-preview, autosave, and owner-scoped API contracts are sufficient. This task is frontend-only.

## Requirements

- Render a persistent multiline editor inside `input.text` nodes and keep it synchronized with the inspector through the existing node config state.
- Preserve native typing, IME, paste, selection, deletion, scrolling, and line breaks without triggering node drag, canvas pan/zoom, graph deletion, or canvas clipboard shortcuts.
- Derive the latest attempt per node from the selected `activeRun` and expose it to route-local node components without persisting callbacks or run data in the workflow graph.
- Automatically select the newest run after a workflow loads; switching the run selector must update all inline node results.
- Show queued, running, completed, failed, blocked, needs-config, empty-output, and historical-revision states on model nodes.
- Preview GPT text as a four-line excerpt with a full dialog and copy command, GPT-Image-2 as a stable gallery using the existing zoom viewer, and Seedance as an inline playable preview plus full dialog.
- Keep the run dock as the source for detailed status, provider ids, errors, and retry controls.
- Render edges as a continuous source-colored base path plus one longer moving highlight, with stable per-edge phase offsets and a reduced-motion solid-line fallback.
- Do not change canvas APIs, database schema, workflow JSON, shared artifact contracts, provider execution, or external-write behavior.

## Acceptance Criteria

- [ ] Text entered in a text node appears immediately in the inspector, survives autosave/reload, and does not move or delete the node while editing.
- [ ] The newest run is loaded automatically and selecting a different run updates the corresponding model-node previews.
- [ ] Retry output uses the highest attempt for each node, and output from an older workflow revision is visibly marked as historical.
- [ ] Text, image, and video model outputs can be inspected from the model node without relying on the bottom dock.
- [ ] Empty, running, failed, blocked, and missing-configuration results have explicit compact states without fabricated fallback content.
- [ ] Every edge remains a complete visible curve while exactly one elongated highlight travels along it; the old repeated short-dash treatment is absent.
- [ ] Reduced-motion mode removes movement while retaining a complete legible edge.
- [ ] Desktop and mobile layouts avoid text, preview, port, and dialog overlap.
- [ ] Focused deterministic checks, TypeScript, lint, build, full Trellis baseline, local production restart, and mocked browser checks pass without external provider or Feishu calls.

## Out Of Scope

- New node types, changes to model execution, artifact persistence, workflow migrations, or API response fields.
- Editing model prompts directly in model nodes.
- Download, asset management, timeline editing, or live paid-provider verification.
