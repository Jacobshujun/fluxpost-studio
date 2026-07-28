# Infinite Canvas Workflows V1 Design

## Architecture

Use `@xyflow/react` for the client graph surface. Keep reusable contracts, graph validation, persistence orchestration, the run scheduler, and node executors under `src/lib/canvas/`. Browser routes authenticate and validate the request before delegating to that domain layer.

Split the node registry into browser-safe definitions and server-only executors. A shared definition contains `type`, `version`, label/category, typed input/output ports, default config, configuration validation, and confirmation capabilities. A server registry maps the same type/version to an executor. Unknown versions are rejected rather than silently upgraded.

## Contracts

- `CanvasArtifact` is a discriminated union for `text`, `images`, `videos`, `socialPost`, and `publishJobRef`.
- `CanvasNode` stores id, definition type/version, position, config, and optional display metadata.
- `CanvasEdge` stores source/target node and port ids. Edge validation resolves port types from the registry.
- `CanvasWorkflow` stores owner, name, revision, graph, viewport, timestamps, and optional template metadata.
- `CanvasRun` stores owner, workflow reference, immutable workflow snapshot, requested target node ids, confirmation record, status, timestamps, and cancellation state.
- `CanvasNodeRun` stores node id/type, attempt, status, input/output artifacts, provider reference such as Seedance `submit_id`, error, and timestamps.

## Persistence

Add PostgreSQL tables `canvas_workflows`, `canvas_runs`, `canvas_node_runs`, and `canvas_run_queue`, with owner/status/update indexes and JSONB snapshots. Add equivalent SQLite schema and adapters in the existing database layer. Workflow updates use `id + owner_user_id + revision`; a stale revision returns a conflict instead of overwriting another tab.

The queue uses the established claim/heartbeat/terminal pattern. A run queue row is unique per run. Run snapshots and node outputs are durable; binary media remains in existing runtime media storage and artifacts contain URLs plus metadata only.

## Execution Flow

1. Validate the saved snapshot, requested target closure, node configurations, and typed edges.
2. Build a topological plan and a confirmation summary listing GPT, image, Seedance, and Feishu nodes.
3. Require explicit client confirmation and enqueue the immutable snapshot.
4. Claim a run, repeatedly execute all ready nodes in parallel, and persist each node attempt before and after execution.
5. Mark downstream nodes blocked when an ancestor fails. Cancellation stops scheduling new work; provider work already submitted remains auditable and may be reconciled.
6. Manual node retry creates the next attempt and resets only its downstream closure while retaining successful upstream outputs from the same snapshot.

Selected-node execution evaluates the selected node and all required ancestors. It does not execute unrelated descendants.

## Node Behavior

- Text/image/video input nodes validate and emit configured literal or media-reference artifacts.
- GPT text accepts text artifacts plus a local instruction and emits text through a new generic text-call helper that shares current configuration, logging, and concurrency.
- GPT-Image-2 accepts prompt text and optional image references, then delegates to the existing image generation library.
- Seedance accepts prompt plus optional image/video references. The wrapper uses `execFile`, allow-listed arguments, real-time `dreamina ... -h` compatible commands, `user_credit`, structured JSON parsing, and `query_result`. It treats `submit_id` and `gen_status` as authoritative.
- Composition combines title/body text and media artifacts into a valid owner-attributed generated post and persists it through the current generated-post store.
- Feishu publish accepts only a `socialPost` artifact, resolves the persisted post, and enqueues the existing Feishu publish job.

## UI

The visual direction is a restrained production control surface: neutral canvas, crisp port colors by artifact type, compact node chrome, high-contrast run states, and minimal decoration. Use the existing theme variables and Lucide icons. Avoid cards inside cards and keep the graph full-bleed.

Desktop uses four stable regions: 248px palette, flexible canvas, 320px inspector, and a bounded bottom run dock. On narrow screens, the graph becomes inspect/run mode and palette/inspector use sheets; structural graph mutation controls are hidden.

Desktop clipboard operations use a versioned FluxPost JSON envelope containing selected nodes and only edges whose endpoints are both selected. Paste validates registered node types and typed ports, assigns new ids, and positions the cloned fragment near the current canvas pointer. Native copy/paste remains untouched while an input, textarea, select, or editable element has focus.

The desktop node palette is a collapsible workspace region. Hiding it removes its grid track so the React Flow stage immediately expands; a toolbar command restores it. Run actions remain in a compact bottom bar, while a right-side task-center drawer queries the existing owner-scoped run endpoints across workflows and separates list filtering from run-detail loading. Selecting a run from the active workflow also makes that snapshot the canvas result context; runs from other workflows remain inspectable without switching or mutating the open graph.

Image files use an authenticated multipart canvas-media route and the shared runtime-media persistence boundary. The client stores only returned URLs in `input.images.config.urls`. Pasting into a selected image node appends images; otherwise the client creates a new typed image-input node at the paste position. Each “图片” node renders up to four references in a fixed-height gallery, with an overflow count, and opens the same root-level themed 50%-400% preview as inspector thumbnails. React Flow `nodrag`, `nopan`, and `nowheel` classes isolate gallery interaction without embedding file bytes in the graph.

## GPT-Image-2 V2 Data Flow

The v2 node stores direct reference URLs in user-defined order. At execution time the executor appends image artifacts in persisted edge order and artifact item order, removes duplicate URLs while retaining the first position, validates the 16-image ceiling, and persists the resolved sequence in the node-run inputs.

The canvas executor uses a strict multi-reference image-generation entry point. It performs one provider request with the requested `n`, never falls back to a source image, and fails when reference preparation is incomplete or the provider returns fewer outputs than requested. ToAPIs receives `image_urls`; the standard OpenAI adapter repeats multipart `image[]` fields up to 16.

The browser receives a latest-success projection from the run-list API. Selected-run state remains available for status inspection, while model nodes can continue rendering the newest successful artifact from an older revision.

## Failure And Safety

- Reject graphs and configs before external work.
- Never retry Seedance after a known `submit_id`; query the same task.
- Do not automatically retry billable nodes or Feishu writes. Manual retry is explicit and attempt-based.
- Return `needs_config` for missing model/CLI configuration and preserve actionable provider errors.
- Keep every API owner-scoped; admins retain existing cross-owner visibility rules only through shared ownership helpers.
- Live Seedance and Feishu verification remains operator-approved and outside the deterministic baseline.
