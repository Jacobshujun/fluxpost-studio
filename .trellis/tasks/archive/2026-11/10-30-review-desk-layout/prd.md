# Review Desk Responsive Layout

## Goal And Scope

Own L1-L4 in `../10-30-review-desk-usability/prd.md`: usable laptop post lists,
reachable editing actions and preserved three-theme review/publishing behavior.

## Requirements

- >=1600: three columns; 960-1599: list/editor and selected-count batch trigger;
  <960: page flow/scroll. Short heights override viewport locking.
- Compact overview, no duplicate status controls; persistent search/filter entry,
  selection and pagination without consuming most list height.
- Independent-scroll filter and batch surfaces with focus management. Advanced
  condition contents belong to the filters child.
- AI editing defaults collapsed; expanded content scrolls. Save/approve/publish
  remain reachable. Do not change API, status or publishing semantics.

## Acceptance Criteria

- [ ] Three themes at 1280x720, 1440x800, 1512x982, 1920x1080 and 390x844.
- [ ] 959/960/1599/1600 width boundaries and reduced-height zoom cases.
- [ ] Complete post card visible on laptop first screen; 50-row list scrolls.
- [ ] Pagination/actions reachable with AI and overlays open; no horizontal overflow.
- [ ] Keyboard focus, Escape, focus return and touch interaction work.
- [ ] Review/publish request semantics unchanged.

## Dependencies And Exclusions

First implementation child after plan approval. Sorting/filtering follow
sequentially. No filter evaluation, image persistence, deployment or theme redesign.
