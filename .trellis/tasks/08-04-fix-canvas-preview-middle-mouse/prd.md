# Fix canvas preview middle mouse conflict

## Goal

Ensure mouse-wheel input inside the infinite-canvas image preview performs only preview zoom and does not also move the scrollable preview stage.

## Background

- The `/canvas` image preview is implemented in `src/app/canvas/page.tsx` by `CanvasImagePreviewBody`.
- The preview stage is an `overflow: auto` container and currently handles wheel zoom through React `onWheel` plus `preventDefault()`.
- Real Chromium interaction confirmed two default-browser paths: wheel zoom updates immediately but its default scroll moves `scrollTop` from `50` to `170` after event settling, while middle-button press and pointer movement starts native auto-scroll and moved `scrollLeft` from `50` to about `700` and `scrollTop` to `531`.
- The underlying React Flow canvas has separate zoom and pan behavior and is outside this bug's scope.

## Requirements

- Handle preview-stage wheel input through a non-passive browser listener so zoom can cancel delayed default scrolling reliably.
- Cancel the preview stage's middle-button `mousedown` default behavior so Chromium cannot start native auto-scroll.
- Preserve the current preview zoom range, zoom step, toolbar controls, sequence navigation, keyboard controls, and focus restoration.
- Keep scrollbars available for explicit inspection of an enlarged image; only the wheel gesture must be exclusive to zoom.
- Do not change React Flow canvas zoom/pan behavior, API contracts, persisted data, or external-provider behavior.
- Deploy the verified exact commit to production `38.76.210.136` through the existing wrapper without changing production configuration, data, or volumes.

## Acceptance Criteria

- [x] Opening an image preview and sending a wheel gesture changes the preview zoom percentage by the existing step without changing existing scroll offsets.
- [x] Pressing and moving the middle mouse button inside the preview does not change the preview stage's `scrollLeft` or `scrollTop` and does not start native auto-scroll.
- [x] Closing the preview restores normal infinite-canvas wheel zoom and leaves preview navigation/toolbar behavior intact.
- [x] A focused deterministic browser regression check, TypeScript, changed-file lint, build, and the full Trellis baseline pass without live provider or Feishu calls.
- [x] `npm run local:restart` refreshes the local production server and `/canvas` responds successfully on `127.0.0.1:3001`.
- [x] The exact verified SHA is deployed to production 38; release identity, public `/canvas`, authenticated API boundary, app/PostgreSQL/Nginx health, protected services, and persistent volumes pass read-only post-deploy checks.

## Out Of Scope

- Redesigning preview panning or adding drag-to-pan.
- Changing infinite-canvas zoom curves, pan controls, or mobile gestures.
- Calling paid image/text providers or writing to Feishu during verification.
