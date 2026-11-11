# Gallery preview after deletion

## Requirements

Deleting the previewed image must continue previewing the next image in the current filtered order. At the end, show the previous image; close only when no adjacent image remains. Button and Delete key share the behavior and existing confirmation/unsaved-edit protection.

## Acceptance

- Successful deletion keeps the same viewer dialog and shows the next image.
- Cursor boundaries load the next image; repeated deletions retain loaded order and pagination.
- Final-image deletion selects the previous image; deleting the only image closes.
- Cancellation and failed deletion preserve the current preview and perform no successful navigation.
- Page-load errors are visible before any deletion and allow explicit retry.
- Three themes and desktop/mobile isolated browser checks plus the documented baseline pass.
- Verify and commit before activating the existing primary-worktree LAN candidate on 3001.

## Scope

Gallery page state/handlers, existing isolated browser checks, and targeted Trellis evidence. No API/schema or provider changes and no actual user-image deletion during verification.
