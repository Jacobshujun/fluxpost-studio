# Design: Review Image Gallery Layout

## Problem

The review desk rebuild (`4a78295`) left three layout regressions in the image
review area:

1. `src/app/globals.css` overrides `.review-gallery` to one column at
   `>=960px` (the base rule is two columns). A post with many images becomes a
   long single stack.
2. Desktop tiles keep `min-height: 360px` (first tile `430px`). At 1280x720
   the gallery scroll pane is only about 310px tall, so a single tile is
   clipped and the prompt/actions sit below the fold.
3. `src/app/review/page.tsx` moved drag/up/down buttons into a detached
   `.review-order-tools` row above each card, while delete stayed in the
   image overlay. Each card gains a row and the controls are split.

At 960-1399px the editor also became two columns, so at 1280px the image column
is roughly 370px wide. The previous layout was stacked below 1400px.

## Decision

Keep the new side-by-side editor and fixed action strip, but restore a compact
multi-image grid and put all order controls back on the image. This preserves
the laptop-height gain from the rebuild without going back to page scrolling.

## Layout Contract

All changes are CSS plus the `ReviewGallery` JSX in `src/app/review/page.tsx`.
No state, API, or persistence changes.

### Gallery Grid

- Base (`<960px`): `.review-gallery { grid-template-columns: minmax(0, 1fr); }`
- `>=960px`: `.review-gallery { grid-template-columns: repeat(auto-fill, minmax(145px, 1fr)); }`.
  145px is the shipped minimum: the 960px editor leaves a ~320px gallery
  pane, and real Chrome reserves a 15px classic scrollbar (content ~303px).
  150px would collapse to one column in headed Chrome; 145px keeps two tracks
  and still leaves room for the overlay.
- Desktop tile: `aspect-ratio: 4 / 3; min-height: 0;`. The preview is
  `height: auto; aspect-ratio: 4 / 3` so tile height follows the grid track.
- `.review-gallery` is an inline-size container. The primary hero is gated by
  the actual gallery width, not only the viewport, and applies only to ordinary
  image lists (`.review-gallery:not(.review-gallery-series)`):
  - `>=960px` viewport, gallery content width `>=470px` (enough for three
    compact tracks with overlay clearance), viewport height `900-999px`:
    `.review-order-item-primary` uses `grid-column: span 2`, the preview uses
    `aspect-ratio: 16 / 9` with `max-height: 160px`. The two-column hero keeps
    the first image 2x the thumbnail width while all four images remain visible
    at 1440x900.
  - Same width rules, viewport height `>=1000px`: the first order item spans the
    full row (`grid-column: 1 / -1`) and the preview caps at `260px`.
  - Viewport height `<900px` or gallery width `<470px`: no span; every tile
    keeps the uniform compact 4/3 size. This prevents a full-row hero from
    hiding the remaining images on 1280x1024, 1600x1000 and 2-column galleries.
- Series galleries receive `.review-gallery-series` and never use the hero span.
  Series cards keep a uniform row (including the missing card) so cover,
  content and candidate metadata stay comparable; at 1920x1080 all three cards
  are visible instead of only the first.
- Keep `overflow-y: auto` on `.review-gallery`; the scroll pane rule in
  `review_desk_scroll_layout_check.mjs` stays valid.

### Editor Split

- Desktop mode (`>=960px` and `>=650px` height):
  `.review-editor-grid { grid-template-columns: minmax(320px, 1.05fr) minmax(240px, 1fr); }`.
  The 240px text minimum is the shipped value; 320px does not fit beside the
  290px list column at 960px. The image column is ~51% of the editor grid, so
  images lead without starving the title/body fields.
- The old `min-width: 1400px` `0.42fr/1fr` override is deleted so it cannot
  become unreachable or win by source order.
- Keep `min-height: 0` and `overflow: hidden` on the grid. Below the 650px
  height desktop boundary the page scrolls and the editor stacks; this is the
  existing short-viewport mode, not a separate gallery rule.

### Order Controls

- The detached `tools(position)` row before the fieldset is removed.
- Drag, up, down and delete render inside the existing
  `.review-gallery-tools` overlay in the tile, in this order: drag, up, down,
  delete.
- Every existing `aria-label` (`拖动配图 N`, `上移配图`, `下移配图`,
  `删除配图`) and the `draggable` drag handlers are preserved.
- Missing series cards render drag/up/down in the same overlay and keep the
  regenerate button.
- `.review-order-item` remains the drop target and `.review-dragging` /
  `.review-drop-target` stay in use so drag behavior and tests keep working.
- The `.review-order-tools` CSS is removed.

Four 24px buttons with 2px gaps need 102px. The overlay uses 6px top/right
insets and the index badge uses 6px top/left, so the group clears the badge by
about 4px at the 960px headed-Chrome minimum. The 24px size replaced the
original 28px proposal because four 28px buttons do not fit the shipped
compact tracks; the 2px gap replaced 3px because 3px left no reliable
separation at that minimum.

### Prompt And Series Metadata

- `.review-image-prompt`: idle `height: 46px; min-height: 46px;`, focus
  `height: 110px;`, `resize: vertical;`. Pure CSS, no React state and no
  persisted field.
- Use `transition: height 140ms ease`. A component-local
  `@media (prefers-reduced-motion: reduce)` rule disables it after the component
  rule in source order; the global `0.01ms !important` reduced-motion rule also
  applies.
- `.review-series-meta` ships at `gap: 5px`, `padding: 6px 8px`, `font-size:
  9px`; candidate buttons are `36x46` with a 4px gap. Candidate thumbnails stay
  visible without a details toggle so selection remains one click and the
  browser suite can select them directly.

### Video And Add Tiles

- No markup or behavior change. Video tiles inherit the shared
  `.review-gallery-preview` 4/3 cell aspect, so their preview stays compact.
  `.review-gallery-add` keeps `min-height: 176px` and the dashed add affordance.

## Interaction And Accessibility

- No new state. `drag`, `target`, `edge`, `locked`, and the reorder callbacks
  stay as they are.
- Keyboard up/down remains available. Drag handle stays focusable and remains
  the only `draggable` element.
- Focus-visible outlines must remain visible against the overlay.
- The prompt textarea stays in the DOM and keeps its placeholder
  (`第 N 张图片 Prompt`) so existing locators still work.

## Test Updates

- `.trellis/verification/review_usability_browser_check.py`:
  - The old drag test waited for `scrollTop > 1000` in a single-column stack.
    The grid drag test now drags the first handle onto the third tile and
    asserts insertion. Edge autoscroll is covered separately with a 16-image
    fixture at 1440x700.
  - Layout assertions cover computed `grid-template-columns` track count,
    index/tools overlay overlap, idle prompt height and fully visible tile
    counts. Four images are required at 1440x900, 1512x982, 1920x900,
    1440x1000, 1280x1024, 1600x1000 and 1920x1080; two at 1280x720.
  - A classic-scrollbar check at 960x720 simulates the 15px Chrome scrollbar
    width and asserts two tracks plus badge/tool separation, because headless
    Chrome otherwise uses overlay scrollbars.
  - A series layout check at 1920x1080 and 1280x1024 asserts the gallery has no
    primary span, visible card counts, three overlay order controls on the
    missing card, no title/tool overlap, and the visible regenerate action.
  - Interactions cover prompt focus expansion (idle <=56px, focus >100px),
    reduced motion, four overlay aria-labels in drag/up/down/delete order,
    duplicate-URL insertion, save/reload prompt alignment, missing-card
    regeneration and candidate selection.
  - Screenshots refresh 1280x720, 1440x900, 1920x1080 and 390x844 in all three
    themes.
- `.trellis/verification/review_desk_scroll_layout_check.mjs` stays valid because
  `.review-gallery` keeps `min-height: 0; overflow-y: auto`.
- `.trellis/verification/review_performance_browser_check.py` uses
  `.review-gallery` selectors and `.review-gallery-preview img`; rerun to
  confirm.
- Do not use port 3001 as a fixture server.

## Risks And Rollback

- At 960px a headed Chrome two-column grid gives ~143px content tiles after the
  border and scrollbar. The overlay still clears the index badge; the preview
  dialog opens full size for inspection.
- Classic scrollbars also shrink the gallery container used by the hero
  container query, so a 1680x1050 gallery with a scrollbar falls back to the
  uniform grid; four images remain visible. The 1440x900 and 1920x1080
  acceptance layouts keep their intended hero behavior.
- At 1440x900 the full-row 260px hero would push the fourth image below the
  fold, so that height band uses the two-column 160px hero instead. The
  full-row hero is reserved for `>=1000px` height and a `>=470px` gallery.
- At 1280x1024 and 1600x1000 the gallery is only two columns wide; no hero is
  used and the uniform grid keeps all four images visible. Series cards never
  use the hero so the cover, missing card and content card stay comparable.
- The hero rules use container queries; current Chrome/Edge/Safari/Firefox
  support them. Without container-query support the blocks are ignored and the
  gallery remains a uniform compact grid, so there is no broken fallback.
- The multi-column change invalidates the old drag scroll assumption. The drag
  test change is required by the layout and is not a weakened contract;
  autoscroll still passes on an overflowing fixture.
- Rollback is CSS-only for the grid (remove the 900/1000 hero blocks and
  `.review-gallery-series` class) plus reverting the JSX control move.
