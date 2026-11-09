# Fix gallery preview navigation flicker

## Goal

Fix library image-navigation flicker while preserving editing, permissions, history, pagination and local deployment rules.

## Requirements

- Keep the same open preview dialog throughout loading and navigation.
- Retain the displayed image and metadata until the requested original is decoded; show recoverable errors without clearing the old image.
- Preserve unsaved-edit guards and prevent stale responses or cross-asset writes.

## Acceptance Criteria

- [x] Delayed details/images, errors/retry, history and rapid navigation retain dialog identity/geometry.
- [x] Draft save/discard/cancel, fit/zoom and desktop/mobile themes pass browser checks.
- [x] Existing baseline and library browser regressions pass.

## Notes

- After implementation verification/archival, activate the final clean commit on the observed LAN binding with `npm run local:lan` and verify runtime SHA matches HEAD. Runtime identity/activation receipt are local ignored state.
