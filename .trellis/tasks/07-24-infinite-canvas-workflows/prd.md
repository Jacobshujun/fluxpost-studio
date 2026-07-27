# Infinite Canvas Workflows V1

## Goal

Add an owner-scoped infinite canvas workspace where FluxPost operators can assemble and manually run typed, acyclic content workflows using text, image, video, model, composition, and Feishu publishing nodes.

## Background

- FluxPost already has workspace authentication, PostgreSQL/SQLite persistence, durable queues, provider concurrency pools, TOS-backed media, GPT-Image-2 generation, OpenAI-compatible text generation, and Feishu publish jobs.
- The repository does not currently contain a graph editor, general DAG executor, workflow persistence, or Seedance/Dreamina integration.
- The running local configuration exposes `gpt-5.5` and `gpt-image-2`. Text-model version changes remain configuration-only.
- `dreamina` is not installed locally. Seedance must therefore fail with an actionable configuration state until the CLI is installed and authenticated.

## Requirements

- Add a standalone `/canvas` operations workspace with a node palette, infinite canvas, property inspector, and run dock.
- Default the empty canvas to left-button pan with an open-hand cursor and show a closed-hand cursor while panning.
- Support owner-scoped create, rename, duplicate, template copy, autosave, revision conflict detection, and delete operations.
- Allow full structural editing on desktop. On narrow mobile layouts allow graph inspection, node configuration, confirmation, and execution without requiring touch-based graph construction.
- Support only directed acyclic graphs in V1. Reject cycles and incompatible port connections before persistence or execution.
- Ship these node types: text input, image input, video input, GPT text, GPT-Image-2, Seedance, social-post composition, and Feishu publish.
- Use a versioned code registry for nodes. Do not execute user-provided code, arbitrary shell commands, or arbitrary Feishu CLI arguments.
- Represent values as typed artifacts: text, images, videos, social post, and Feishu publish job reference.
- Create immutable graph snapshots for runs. Editing a workflow after enqueue must not change an existing run.
- Support whole-graph and selected-node execution, parallel ready nodes, downstream blocking on failure, cancellation, and manual retry using successful upstream results from the same snapshot.
- Require explicit confirmation before a run that contains billable model work or Feishu writes is enqueued.
- Keep media as validated URLs/object references and metadata. Do not persist binary or base64 media inside workflow JSON.
- Reuse existing text, image, TOS, generated-post, and Feishu queue boundaries rather than calling internal HTTP routes.
- Integrate Seedance through an allow-listed Dreamina CLI wrapper. Validate 4-15 second duration, supported ratios and resolutions, and multimodal input limits; query credit before submission; persist `submit_id` and business status; never resubmit merely because foreground polling timed out.
- Surface validation, provider, queue, cancellation, and ownership errors to the operator.
- Support desktop node copy, cut, paste, duplicate, and delete operations without intercepting native clipboard behavior inside text inputs.
- Name image-input nodes “图片”; show their images directly in a stable 1-4 tile node gallery, let operators import or paste supported files, create typed nodes from canvas paste, and open a zoomable full preview from node or inspector thumbnails.

## Acceptance Criteria

- [ ] A signed-in operator can create, edit, save, duplicate, template-copy, rename, and delete only their own workflows.
- [ ] A valid workflow round-trips nodes, edges, viewport, revision, and node configuration through the API and database.
- [ ] Invalid node configuration, incompatible port types, dangling edges, duplicate ids, and cycles are rejected with clear errors.
- [ ] A run stores an immutable graph snapshot and exposes workflow, node, and attempt status through an owner-scoped API.
- [ ] Ready branches run concurrently within existing provider limits; failed nodes block downstream nodes without hiding the original error.
- [ ] Cancellation stops new downstream scheduling; retry creates a new node attempt and reuses valid successful upstream artifacts.
- [ ] GPT text and GPT-Image-2 nodes use existing configured providers and return typed artifacts.
- [ ] Seedance supports text-to-video, image-to-video, and multimodal submission contracts, preserves `submit_id`, and reports `needs_config` when Dreamina is unavailable.
- [ ] Composition creates an owner-attributed generated post; Feishu publishing uses the existing durable publish queue and never exposes raw CLI execution.
- [ ] Desktop UI supports pan, zoom, node addition, drag, selection, connection, deletion, editing, saving, and execution without layout overlap.
- [ ] The desktop canvas defaults to an open-hand cursor for panning and changes to a closed hand while the viewport is being dragged.
- [ ] Desktop node copy/cut/paste preserves selected nodes and their internal edges, creates collision-free ids, and places pasted content near the canvas pointer.
- [ ] “图片” nodes render a stable inline gallery, support authenticated upload, clipboard images, thumbnail removal, 50%-400% full preview zoom, and direct canvas image paste without embedding binary/base64 data in workflow JSON.
- [ ] Mobile UI supports graph inspection, node parameter edits, confirmation, execution, status, and result preview without horizontal overflow.
- [ ] Deterministic checks cover ownership, persistence, graph validation, execution semantics, and provider adapter wiring without calling paid services or Feishu writes.
- [ ] TypeScript, lint, build, the Trellis baseline, local production restart, and browser screenshots pass.

## GPT-Image-2 V2 Increment (2026-07-27)

- Replace the fixed-role reference design with one generic multi-image input.
- Combine ordered direct uploads and ordered upstream artifacts, deduplicate by URL, and reject more than 16 references before provider submission.
- Submit all references in one edit request. Zero references use generation mode; one through sixteen use edit mode.
- Expose ratio, resolution, quality, count (1-10), output format, and JPEG compression using the verified ToAPIs contract.
- Preserve immutable v1 run snapshots while upgrading editable v1 nodes to v2 during their next normal save.
- Show the latest successful node output independently from the selected run, including revision, timestamp, target settings, and loaded pixel dimensions.
- Keep the animated edge core at the base edge width and constrain the halo to 3.6px (4.4px selected).

## Out Of Scope

- Conditions, loops, schedules, webhooks, automatic triggers, published workflow versions, and real-time collaboration.
- User-installed plugins, arbitrary JavaScript, arbitrary shell commands, and arbitrary Feishu CLI operations.
- Automatic long-video stitching, video extension beyond 15 seconds, or editing-generated clips into a final timeline.
- Default automated live calls to OpenAI-compatible providers, Dreamina, TikHub, ComfyUI, TOS writes, or Feishu writes.
