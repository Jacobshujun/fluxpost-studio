# Gallery collection hierarchy verification — 2026-11-11

## Confirmed causes and repair

- `listLibraryCollectionsFromDb` returns chronological rows. The gallery rendered them in that flat order with depth-only indentation, so a newly created child appeared after unrelated roots. Parent IDs were retained correctly by the creation service.
- `libraryCollectionRows` now traverses parent IDs, retaining sibling order, grouping descendants, handling inaccessible ancestors as visible roots and retaining search ancestors independently of collapsed state.
- The heading creates a root; each editable row explicitly creates a child and the dialog shows its target path. Successful child creation expands the parent.
- Rename previously sent `visibility: "private"` even for team collections. PATCH now sends only `name`, retaining parent and visibility.
- Sidebar action padding accounts for the extra child-create button.
- No application runtime data migration or historical membership repair was required or performed.

## Verification

- `node .trellis/verification/library_ui_check.mjs`: pass, including chronological and arbitrary input order, multiple roots/siblings, nested children, collapse/search and inaccessible parents.
- `node .trellis/verification/unified_library_runtime_check.mjs`: pass in temporary SQLite, including actual requested-parent persistence, team rename, descendant path refresh, cycle rejection, deletion/reparenting and asset membership preservation. The legacy fixture now includes the same relation foreign keys as the real schema.
- `$env:TRELLIS_SMOKE_PORT = "45678"; powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`: pass. Includes lint (0 errors, 15 existing warnings), TypeScript, production build, built-config check, HTTP smoke and SQLite check.
- `python .trellis/verification/library_collection_batch_browser_check.py`: six three-theme 1440/390 cases pass. Added actual POST parent payloads, deep creation, placement, parent expansion, search ancestors, failure draft retention, explicit root creation, name-only PATCH, team visibility and reload assertions. Existing filters/history, paging, preview/drafts, batch permissions/move, permanent-delete confirmation and serial import retry checks pass.
- `python .trellis/verification/library_load_error_browser_check.py`: six cases pass.
- `python .trellis/verification/library_preview_browser_check.py`: six cases pass, including continuous decoded-image/dialog geometry checks.
- `python .trellis/verification/library_colors_browser_check.py`: six gallery/Canvas color cases pass.
- Browser runs used a worker-disabled loopback test server on 45678, mocked APIs/media and no live provider/storage writes. The Windows helper stopped its shell but left the Next listener alive; its exact PID/command/port were verified before explicitly stopping it after the runs. Port 3001 stayed on the original PID.
- `git diff --check` on scoped changes: pass.

## Delivery limitation

Port 3001 remains the previous candidate. At startup, the primary worktree already contained 30 unrelated modified/untracked paths (primarily Magpie search and prior analysis). These are preserved and excluded from the repair commit. `AGENTS.md` requires clean committed HEAD before local activation and forbids bypassing that guard or using sibling worktrees. Local authenticated operator acceptance and activation remain pending; no remote release was requested.

## LAN delivery — 2026-11-11

- User explicitly authorized committing the remaining changes and updating LAN. The remaining Magpie changes and diagnostic records were committed; the primary worktree is clean.
- Candidate `b30d64bff4a4e467a8a56fdeee9ef389a25f50db` includes gallery repair `b35d22b`; live `/api/version` and the managed slot receipt matched the full HEAD. Listener binding is `0.0.0.0:3001`.
- Existing `http_smoke.js` passed on both loopback and LAN. `/library` returned HTML/HTTP 200 at both addresses. No authenticated library mutation, live model/search request or remote deployment was performed.
- This supersedes the activation limitation above. Later documentation commits use the same managed `npm run local:lan` entry; the ignored candidate receipt and `/api/version` identify the final active SHA. Authenticated operator acceptance remains separate.
