# Canvas Layer Composition

`utility.layer-compose` v1 accepts concurrent `images` and `videos` inputs and emits
one PNG or one H.264/AAC MP4 through the existing typed output ports. Configuration
is `composition: LayerComposeConfig` protocol 1 in the existing workflow JSON.

- Canvas: integer 64–4096 px per edge; MP4 requires even dimensions and opaque base.
- At most 24 layers including 4 videos. Visibility controls output; locks only editing.
- Single-item upstream outputs use node/port bindings across reruns. Multi-item
  and legacy selections use source hash or URL identity, never input indices.
  Missing/ambiguous bindings require reselection. Rendering checks supplied hashes.
- Non-destructive normalized crop plus contain/cover geometry is shared between DOM,
  Sharp and FFmpeg. Positions and clipping use rounded output pixels.
- Visible videos start together. Longest/custom duration is capped at 600 seconds;
  hold, loop, and hide endings default to hold. One audio source or silence; loop
  repeats its audio, otherwise audio ends in silence. Output is 30 fps.
- Authenticated `POST /api/canvas/layer-compose/inspect` accepts `{kind,url}` and
  returns dimensions, optional duration and audio availability. Directory snapshots
  resolve through the signed-in owner. Arbitrary client localPath values are unused.
- Editor metadata reuses upstream dimensions, duration and optional hasAudio (including
  false). Missing visible sources use a session-local deduplicated queue of two, with
  per-source status/retry. Adding a layer is synchronous; metadata completion never
  writes draft/history. Closing aborts client requests and discards queued work.
- Inspection skips full-file digests. Its owner/kind/location cache holds at most 128
  results; local keys include size/mtime/ctime and expire after 5 minutes; remote URLs
  expire after 60 seconds. Private snapshots are authorized before cache lookup.
  Failures are not cached. Probes use mediaMetadata (default 2, hard cap 4) separately
  from rendering. Unknown remote cold reads still download the full source; cancelling
  the client does not cancel an already running server materialization.
- Preview videos use metadata preload; playback/seeking loads needed data. These are
  browser hints, not a guarantee of zero media transfer. Rendering always revalidates
  content, so preview metadata never substitutes for export hash/size/probe checks.
- Rendering uses actual-byte digests, versioned config keys, staged output and
  dimension/duration/audio checks. Existing localImage/localVideo pools apply.
- Incomplete sources remain saveable; execution rejects them. Dialog drafts are
  applied atomically, with local bounded undo/redo. No database migration.
- The editor portal mounts under body, outside .canvas-shell. Surfaces and controls
  use global panel-solid with text-strong; canvas-scoped CSS tokens are unavailable.
  UI theme changes must not recolor the output canvas or its layers.

Verification: `node .trellis/verification/canvas_layer_compose_check.mjs` (baseline)
and `python .trellis/verification/canvas_layer_compose_browser_check.py` with
`BROWSER_BASE_URL` pointing to a worker-disabled loopback smoke, never port 3001.
All fixtures are isolated and browser APIs intercepted. No provider or publishing calls.

## Rerun binding contract

### Scope / Trigger
Generated outputs can change URL/hash on every run. Single-item selections follow
the immediate upstream node output while preserving geometry, crop and audio choice.

### Signatures
`bindComposeInput(artifact, nodeId, port)` annotates media at the editor/runtime
input boundary. `composeLayerSource(source)` persists the selection;
`findComposeSource(layer, sources)` resolves it before preview or rendering.

### Contracts
`LayerSource = {kind, key, binding?: {nodeId, port}}`. `key` remains the selected
content identity. Bindings are emitted only for exactly one item in an output.
Runtime annotations overwrite inherited provenance; other node inputs are untouched.
Clipboard remaps copied upstream IDs. Export/import preserves the binding.
Legacy layers require one explicit replacement to adopt a new binding; replacement
preserves crop and geometry. No automatic user-data migration or index inference.

### Validation and errors
Binding identifiers must be nonempty strings of at most 160 characters. A bound
layer requires exactly one matching kind/node/port; it never falls back to its old
URL. Disconnected, empty or newly multi-item outputs require reselection. URL/hash
selections retain exact content matching. Actual-byte hash checks still apply.

### Cases
Good: new generated URL from the same single output replaces the rendered media.
Base: legacy URL still present renders unchanged. Bad: a bound single output becomes
two items; execution reports unavailable/ambiguous upstream instead of using item 0.

### Tests
Layer checks exercise real PNG/MP4 rerenders, unchanged crop, cache changes, wrong
origin, multi-item rejection, duplicate content across nodes and clipboard remapping.
Run-dispatch checks assert runtime provenance reaches the executor. Browser checks
change a computed output, reload, verify new preview and explicitly replace a legacy
selection at 1440/390 while retaining crop.

### Wrong / Correct
Wrong: persist only a generated URL or silently choose the first replacement item.
Correct: save the explicit upstream binding for a single-item output and fail on
ambiguity; retain content identity for a selection within a multi-item output.
