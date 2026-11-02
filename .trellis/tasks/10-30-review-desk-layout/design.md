# Responsive Layout Design

## Ownership

Layout markup in `src/app/review/page.tsx`, scoped rules in `src/app/globals.css`,
and review layout/browser checks. Extract local components only when justified;
no blanket page refactor or unrelated styling changes.

## Structure

One responsive workspace hierarchy. At normal desktop heights, flex/grid ancestors
use `min-height: 0`, independent list/editor scrolling, compact list header/footer
and flexible list body. Laptop batch controls open a focus-managed overlay; wide
screens retain visible batch operations.

Below 960px use document flow/auto height. Add a wider-screen low-height escape
based on measured content minimums. Test zoom by reduced CSS viewport dimensions,
not device scale factor alone. Page scroll is acceptable; clipped actions are not.

AI editing has explicit collapsed state and bounded scroll when open. Dialogs
preserve drafts, existing theme variables, keyboard dismissal and return focus.

## Verification Design

Replace obsolete 1120px lock assertions with structure and browser geometry tests:
full card visibility, scrollbar travel, reachable actions, page/container widths.
Do not conceal overflow simply to satisfy width assertions. Final integration
must repeat these checks after advanced filters and dragging land.
