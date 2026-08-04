# Design

## Interaction Boundary

Keep the fix local to `CanvasImagePreviewBody`. Attach a native `wheel` listener to the preview stage with `{ passive: false }`, cancel the default action, apply the existing zoom step, and remove the listener during effect cleanup. On the preview stage's `mousedown`, also call `preventDefault()` only when `event.button === 1`. Together these block delayed wheel scrolling and Chromium native auto-scroll without changing primary-button interactions or explicit scrollbar use.

React Flow receives no new props and its viewport behavior remains unchanged.

## Verification Boundary

Add a task-local Playwright check that mocks Canvas APIs and image bytes, opens the image preview, enlarges and offsets the scrollable stage, confirms wheel zoom keeps scroll offsets fixed, then presses and moves the middle button and asserts neither scroll offsets nor zoom change. After closing the dialog, assert the underlying React Flow viewport still responds to wheel input.

The full project baseline remains authoritative. Browser mocks must intercept local APIs/media and must not call production, PostgreSQL mutations, providers, or Feishu.

## Deployment And Rollback

Build and restart local production first. Commit and push only task-owned source, verification, and Trellis files. Deploy the exact full SHA to production 38 through `/opt/fluxpost-studio/bin/deploy.sh --ref <sha>` after read-only preflight.

The deployment wrapper owns activation rollback. If wrapper health succeeds but Canvas-specific checks fail, restore the captured prior release with the manifest-aware rollback command. Never remove or replace production volumes.
