# Implementation Plan

## 1. Domain And Persistence

- Add shared timeline/revision contracts, validation and edit operations.
- Extend node config and node-run internal metadata serialization.
- Add SQLite/PostgreSQL schema, migration and owner-scoped revision/waveform helpers.
- Add focused deterministic domain/database checks.

## 2. Recognition, Rendering And Waveform

- Return structured recognition metadata and persist it on successful node runs.
- Select matching frozen snapshots before transcript-cache/Whisper work.
- Implement FFmpeg PCM waveform extraction, cache and in-process generation deduplication through `localVideo`.
- Prove matching snapshots skip Whisper and mismatch falls back to recognition.

## 3. APIs And Isolated Apply Flow

- Add open/create, save and waveform routes with session/access/error contracts.
- Reuse workflow PATCH revision and isolated run POST boundaries.
- Add cleanup on workflow delete and scheduling/config round-trip assertions.

## 4. Full-Screen Editor

- Add node/result entry points and legacy rerun state.
- Implement synchronized video, overlay, waveform timeline, block dragging/resizing, selection, text/time fields, CRUD/split/merge, zoom, keyboard nudge and undo/redo.
- Implement explicit save, restore confirmation, dirty close confirmation and apply/regenerate sequencing.
- Add responsive CSS and deterministic Playwright coverage at desktop/mobile viewports.

## 5. Verification And Activation

- Run focused subtitle, workflow, scheduler, schema and browser checks.
- Run TypeScript, lint, production build and full offline Trellis baseline.
- Update stable Canvas subtitle architecture/verification facts and feature/status evidence.
- Commit, archive the task, record the session, run `npm run local`, then verify `/api/version` exact SHA and `/canvas` on port 3001.
