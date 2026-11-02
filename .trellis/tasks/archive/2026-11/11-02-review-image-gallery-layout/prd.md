# Review Image Gallery Layout Optimization

## Goal

Restore the previous compact, scannable image-review layout after the
2026-11-02 review desk rebuild, while keeping the new free-ordering features
(drag insertion, missing series cards). Do not change save, approval, publish,
filter, or media-lock contracts.

## Authorization And Background

- Source: user reported on 2026-11-02 that the current image review layout is
  less attractive and direct than the previous version, then approved task
  creation and planning.
- The prior review desk task (`10-30-review-desk-usability`) intentionally
  introduced drag insertion and free ordering. The visual regression came with
  the same rebuild: desktop gallery forced to one column, order controls moved
  to a separate row above each card, and the image/text split starting at 960px.
- The previous default gallery was a two-column grid with a full-width first
  image and overlay controls.

## Requirements

### G: Gallery

- G1: At >=960 CSS px, ordinary image lists render as a multi-column grid.
  The first image may span the row with a capped height. At 1280x720 at least
  two images are visible in the gallery pane without scrolling; at 1440x900 and
  1920x1080 at least four images of a four-image post are visible.
- G2: No tile may be taller than the gallery viewport on short desktop screens.
  Replace fixed 360/430 minimum heights with aspect-ratio plus a height cap.
- G3: The first image stays visually primary without pushing the remaining
  images out of the first screen.
- G4: Below 960px the gallery remains single-column and never overflows
  horizontally at 390px.

### O: Ordering Controls

- O1: Drag handle, move up, move down and delete form one overlay group on the
  image. No detached control row above the card.
- O2: Preserve drag insertion, duplicate-URL identity, missing-series-card
  movement, edge autoscroll, drag cancellation, and the media lock.
- O3: Missing series cards keep drag/up/down controls and their visible
  regenerate action.

### P: Prompt And Metadata

- P1: The prompt editor stays directly editable but compact when idle
  (<=56px) and expands on focus. No new persisted state or JS toggle.
- P2: Series candidate and status metadata become more compact; selecting a
  candidate stays one click.

### L: Editor Split

- L1: At 960-1599px keep the list/editor side by side and widen the image
  column to about 55% of the editor grid so images lead.
- L2: >=1600px keeps the existing three-column workspace and fixed action
  strip.
- L3: Independent gallery/text scrolling remains.

### C: Compatibility

- C1: No changes to review APIs, persistence, review patch payload, approval,
  publishing, structured filters, image-order libraries, or media locking.
- C2: The preview dialog is unchanged in this task. A thumbnail rail and prompt
  editing inside the preview are a follow-up.

## Acceptance Criteria

- [ ] At 1440px the computed gallery grid has at least two tracks; screenshots
  at 1280x720, 1440x900, 1920x1080 and 390x844 show the intended layout in all
  three themes.
- [ ] At 1280x720 at least two images are visible without scrolling; at
  1440x900 at least four images of a four-image fixture are visible.
- [ ] No `.review-order-tools` row remains; drag, up, down and delete are
  inside `.review-gallery-tools`.
- [ ] Drag insertion, up/down ordering, missing-card regeneration, candidate
  selection and the saved `imageUrls`/`imagePrompts` payload are unchanged.
- [ ] The idle prompt editor is <=56px tall and expands on focus without new
  state.
- [ ] Baseline (`check.ps1`: lint, TypeScript, Next build, DB, HTTP smoke),
  the updated three-theme review browser suite, and review performance checks
  pass.
- [ ] No horizontal overflow at 390px; themes and contrast remain intact.

## Out Of Scope

- Preview dialog thumbnail navigation and prompt editing.
- Restoring a stacked image-above-text layout at 1280px.
- Any API, persistence, approval, publishing, or filter change.

## Notes

- 1280px decision: keep the side-by-side editor and widen the image column.
  This is the recommended default and is reversible with one grid rule after
  visual review.
- Final visual acceptance requires the authenticated operator on port 3001.
