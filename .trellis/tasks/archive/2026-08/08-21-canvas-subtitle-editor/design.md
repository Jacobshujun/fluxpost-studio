# Technical Design

## Data Flow

`video input -> media materialization/probe/hash -> recognize or frozen snapshot -> validate timeline -> ASS render -> internal node-run metadata -> revision API -> editor -> workflow snapshot -> isolated rerender`

`revision waveform request -> owner/access lookup -> source media materialization -> FFmpeg PCM decode in localVideo pool -> deterministic peak reduction -> owner/video/protocol cache -> editor canvas`

## Shared Contracts

- Add shared subtitle editor types and decoders next to the Canvas subtitle domain: segment validation, revision snapshot parsing, internal run metadata parsing, cloning and segment operations use one implementation.
- Extend Canvas config serialization to permit the versioned structured revision snapshot while retaining flat values for all other node configs. Registry validation owns the subtitle snapshot shape.
- Extend `CanvasNodeRun` with optional internal subtitle metadata. It is persisted in run JSON but never becomes a public artifact port.

## Persistence

- Add `canvas_subtitle_revisions` keyed uniquely by `(owner_user_id, workflow_id, node_id, video_sha256)`, storing original/edited segments JSON, source media JSON, duration, protocol version, integer revision and timestamps.
- Add `canvas_subtitle_waveform_cache` keyed by `(owner_user_id, video_sha256, waveform_protocol_version)` with duration, points-per-second, peaks JSON and timestamps.
- Implement matching SQLite/PostgreSQL schema initialization and row-level helpers in `src/lib/database.ts`; add additive migration `db/migrations/004_canvas_subtitle_revisions.sql` and update the initial PostgreSQL schema.
- Revision update is one compare-and-set statement. A zero-row update distinguishes inaccessible/missing from stale revision without overwriting newer data.
- Workflow deletion deletes dependent revisions in the same domain operation. Foreign keys use cascade where existing schema ownership permits it.

## API

- `POST /api/canvas/subtitle-revisions`: authenticate, validate ids, load accessible workflow/node run, require successful subtitle-node metadata, verify node belongs to workflow, upsert/open the video-keyed revision, return revision plus an authorized source-video URL.
- `PATCH /api/canvas/subtitle-revisions/[id]`: authenticate, validate revision and complete segment array through shared validator, compare-and-set, return 409 with current revision metadata on conflict.
- `GET /api/canvas/subtitle-revisions/[id]/waveform`: authenticate/access-check, generate or return cached waveform, map configuration/input errors to explicit 4xx/5xx responses without subtitle text.

## Execution

- Recognition result exposes validated segments, duration and video hash to `executeVideoSubtitles`, which persists internal metadata with the node run.
- A valid config snapshot is usable only when its protocol is supported and SHA-256 equals the materialized current input. Matching snapshots bypass transcript-cache lookup and Whisper. Mismatches take the unchanged recognition path.
- Rendering stays in the existing `localVideo` pool and creates the same H.264/AAC public outputs and merged text output from the chosen timeline.
- The browser apply command saves the revision, writes the frozen snapshot through the existing workflow revision PATCH, updates local revision state from the response, then POSTs an isolated run targeting only the subtitle node.

## Editor State

- Keep route-local modal state in `/canvas`: server revision baseline, editable segment list, selection, playhead, zoom/scroll, undo/redo history, busy/error states and dirty comparison.
- A focused segment editor owns its local text and caret. Timeline pointer interactions use pointer capture and 10ms rounding.
- The waveform canvas has stable CSS dimensions and device-pixel rendering; horizontal timeline scroll is contained inside the modal.
- Full-screen modal reuses existing preview backdrop behavior. Desktop uses video + inspector above timeline; mobile stacks video, horizontally scrollable timeline and bottom editor.

## Error Matrix

| Condition | Result |
| --- | --- |
| Missing session | 401 |
| Invalid ids/segments/revision | 400 |
| Inaccessible workflow/run/revision | 404 |
| Old run without metadata | 409 with rerun-required code |
| Stale subtitle revision | 409 with current revision |
| Stale workflow revision during apply | 409; saved draft retained, no run |
| Snapshot hash mismatch | Ignore snapshot and recognize normally |
| Missing/no-audio/timeout waveform input | Explicit error; no empty successful waveform |
| Close dirty editor | Native confirmation; remain open on cancel |

## Visual Direction

Use a restrained post-production workbench: charcoal media stage, high-contrast white/cyan timeline marks, amber active segment, dense neutral inspector controls, square 6px geometry, and existing FluxPost typography/control tokens. Motion is limited to playhead and selected-block transitions; no decorative cards or gradients.
