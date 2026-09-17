# Canvas Layer Composition

`utility.layer-compose` v1 accepts concurrent `images` and `videos` inputs and emits
one PNG or one H.264/AAC MP4 through the existing typed output ports. Configuration
is `composition: LayerComposeConfig` protocol 1 in the existing workflow JSON.

- Canvas: integer 64–4096 px per edge; MP4 requires even dimensions and opaque base.
- At most 24 layers including 4 videos. Visibility controls output; locks only editing.
- Layers use source hash or URL identity, never input indices. Missing identities
  require reselection. The execution checks any supplied hash against actual bytes.
- Non-destructive normalized crop plus contain/cover geometry is shared between DOM,
  Sharp and FFmpeg. Positions and clipping use rounded output pixels.
- Visible videos start together. Longest/custom duration is capped at 600 seconds;
  hold, loop, and hide endings default to hold. One audio source or silence; loop
  repeats its audio, otherwise audio ends in silence. Output is 30 fps.
- Authenticated `POST /api/canvas/layer-compose/inspect` accepts `{kind,url}` and
  returns dimensions, optional duration and audio availability. Directory snapshots
  resolve through the signed-in owner. Arbitrary client localPath values are unused.
- Rendering uses actual-byte digests, versioned config keys, staged output and
  dimension/duration/audio checks. Existing localImage/localVideo pools apply.
- Incomplete sources remain saveable; execution rejects them. Dialog drafts are
  applied atomically, with local bounded undo/redo. No database migration.

Verification: `node .trellis/verification/canvas_layer_compose_check.mjs` (baseline)
and `python .trellis/verification/canvas_layer_compose_browser_check.py` with
`BROWSER_BASE_URL` pointing to a worker-disabled loopback smoke, never port 3001.
All fixtures are isolated and browser APIs intercepted. No provider or publishing calls.
