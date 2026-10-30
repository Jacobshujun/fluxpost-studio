# Keep resized Canvas node status compact

## Goal

Keep execution status compact when users resize Canvas nodes, prioritizing usable content over empty status space.

## Requirements

- The shared resized-node `.canvas-node-result` rule in `src/app/globals.css:276` currently grows every result container, including status-only attempt summaries (`src/app/canvas/page.tsx:2634`).
- Status-only, idle, failure and waiting results use natural content height; no empty growing status block or blank completion-summary minimum height.
- Actual text/image/video result previews retain expansion. Status headers do not grow or compress with their result container.
- Errors/wait reasons remain readable through existing content scrolling, including narrow nodes. No diagnostic truncation, execution/persistence changes or fixed-on-screen overlays.
- Preserve whole-canvas zoom, node dimensions, resize handles, themes and editor viewport behavior. Use shared CSS for outer and iteration nodes, not per-node patches.
- Scope: `src/app/globals.css`, regression checks and task/spec evidence in `.trellis/`; no API/schema changes or runtime-data migration.
- User approved the lightweight task, implementation, automatic commit and LAN activation. No remote deployment.

## Acceptance Criteria

- [x] Completed status-only panels contain no blank extra height before/after resizing; editor/image content receives extra space.
- [x] Running, failed, waiting and idle states remain compact/readable; actual text/image/video output panels retain expansion.
- [x] Browser checks demonstrate a pre-fix failure and cover mouse resizing, saved dimensions, narrow/large nodes, three themes and desktop/mobile sizes using isolated fixtures.
- [x] Focused checks, source lint, types, build and baseline run; unchanged blockers are reported, not suppressed.
- [x] Commit verified changes, archive task evidence and activate clean HEAD on LAN 3001 with exact identity and HTTP smoke.

