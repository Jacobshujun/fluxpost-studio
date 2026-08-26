# Canvas batch image source controls

## Goal

Make image-source selection in the infinite-canvas batch scheduler practical for large libraries: operators must be able to select or clear images in bulk, inspect an image before choosing it, and browse every matching image instead of being limited to the first visible subset.

## Background

- The affected UI is `ScheduleAssetFilterEditor` in `src/app/canvas/page.tsx`, used by image and image-group parameters in the V2 batch scheduler.
- The current query asks `/api/library/assets` for up to 100 assets, but the grid renders `data.assets.slice(0, 30)`. Assets after the first 30 have no UI path.
- The component does not retain or consume the library API cursor, so matches beyond the first response cannot be reached.
- A thumbnail click is currently reserved for toggling manual selection and random/condition mode disables the thumbnail button. No preview command is exposed.
- Manual mode supports only one-at-a-time toggling. It has no select-all, range selection, or bulk clear command.
- Existing library UI and frontend rules already define reusable selection semantics: ordinary click/select, Shift ordered range, Ctrl/Cmd additive toggle, cross-cursor select-all, and full-screen image preview.

## Requirements

### R1. Bulk manual selection

- Manual image-source mode must expose a select-all command that selects all assets matching the active role, search, collection, and AND-tag filters, including assets on pages not yet rendered.
- Manual image-source mode must expose a bulk clear command that removes the current image-source selection.
- Multi-select image parameters must support ordered Shift range selection and Ctrl/Cmd additive toggling in the visible loaded list.
- Fixed single-image parameters must remain single-select and must not expose misleading multi-select commands.
- Bulk operations must preserve the current filter definition and update only `assetIds`.

### R2. Image preview

- Every rendered image must provide an explicit preview action that does not change selection.
- Preview must work in manual and condition-match modes.
- Preview must show the image at an inspectable size and provide close plus bounded previous/next navigation across currently loaded images.
- Preview controls must be keyboard accessible and must not trigger canvas gestures behind the overlay.

### R3. Large-result browsing

- The image area must have a bounded, independently scrollable viewport so a large result set does not expand the scheduler editor without limit.
- The component must render the complete first API page rather than an arbitrary 30-item slice.
- When `nextCursor` is present, the operator must be able to load the next page and append it without losing selection.
- Changing role, search, collection, or tags must reset the visible result pages and cursor consistently.
- Loading, empty, error, total-match, loaded-count, and selected-count states must remain visible and accurate.

### R4. Compatibility and scope

- Existing `CanvasScheduleAssetFilter` persistence and scheduler preflight contracts must remain unchanged.
- Condition-match/random scheduling behavior must remain unchanged; the work is limited to source browsing and manual selection UI.
- Existing owner-scoped `/api/library/assets` authorization and filtering must be reused.
- Desktop and mobile layouts must avoid horizontal overflow and overlapping controls.
- The V2 expanded preflight tree must render frozen main/child image snapshots and reuse the existing bounded image viewer without changing schedule data.

## Acceptance Criteria

- [ ] In a multi-image manual source, select-all stores every matching asset id across all API cursors; bulk clear leaves `assetIds` empty.
- [ ] Shift range and Ctrl/Cmd additive selection work against the ordered loaded image list; ordinary selection remains usable.
- [ ] A fixed single-image source still allows only one selected asset and omits bulk-selection controls.
- [ ] Clicking the preview command opens the correct full-screen image without changing `assetIds`; close and previous/next controls work.
- [ ] Condition-match mode permits preview while keeping selection controls unavailable.
- [ ] More than 30 matches are visible through the scrollable result area, and additional cursor pages can be appended.
- [ ] A filter or library-role change discards stale visible pages and prevents stale requests from replacing the new result set.
- [ ] The expanded V2 preview shows decoded main/child task thumbnails, opens the correct task-local sequence, and remains unobscured by the sticky launch bar.
- [ ] Focused deterministic checks cover selection, cursor loading, preview hooks, and the removal of the 30-item truncation.
- [ ] TypeScript, scoped lint, production build, project baseline, and mocked desktop/mobile browser verification pass without live provider calls.

## Out Of Scope

- Changes to scheduler sampling, preflight, launch, persistence schema, or library API authorization.
- Editing, deleting, importing, tagging, sorting, or reorganizing library assets from the scheduler.
- Live image-model, Seedance, Feishu, or other paid/external execution.
