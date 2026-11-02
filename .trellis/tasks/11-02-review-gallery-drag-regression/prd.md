# Fix Review Gallery Drag Ordering Regression

## Goal

Restore drag reordering of review images after the 2026-11-02 gallery layout
change (`246ff0a`).

## Root Cause

The drag handle moved inside the per-image `<fieldset>`. The fieldset uses
`disabled={drag !== null || locked}`, so the first `dragstart` sets `drag`,
React disables the fieldset, and the browser cancels the active drag. The same
state also activates `.review-gallery fieldset:disabled { pointer-events: none; }`.

## Requirements

- R1: The image fieldset stays enabled while a drag is in progress. It may
  still disable when the media lock is active.
- R2: Up, down, delete and regenerate controls stay disabled during a drag.
  The drag handle itself stays enabled and draggable.
- R3: Do not change reorder logic, save payloads, media locking, series cards,
  APIs, or persistence.
- R4: Add a browser regression assertion: after `dragstart`, the containing
  fieldset is not disabled and the handle still has `draggable="true"`.

## Acceptance Criteria

- [ ] A real mouse drag from handle 1 to tile 3 reorders prompts and persists
  after save/reload, including duplicate URLs.
- [ ] After `dragstart`, the containing fieldset is not disabled.
- [ ] Up/down/delete remain disabled during drag.
- [ ] Lint, TypeScript, the three-theme browser suite and the full baseline
  pass.
- [ ] The LAN candidate is rebuilt from the fix commit and `/api/version`
  matches the receipt.

## Out Of Scope

- Making the image body itself draggable; only the handle is a drag source.
- Preview-dialog ordering.
