# Copy-library new draft selection reload

## Scope
Fix the confirmed new-entry regression without changing APIs, shared URL hooks, or the port-3001 listener. User approved the diagnosed fix on 2026-09-08.

## Implementation
- Separate list fetching from URL-selected entry changes.
- Keep explicit new drafts intact through list refreshes and in-flight responses.
- Preserve initial/deep-link selection, synchronous editor commands, and browser history restoration.
- Clear pending tag input when starting a new draft.

## Acceptance
- New remains editable with populated, empty, and read-only-first lists.
- Saving a new draft sends POST; editing the saved entry sends PATCH.
- Clicking New or an existing entry does not refetch the list.
- URL hydration and popstate restore the matching draft without loading the list.
- Slow list responses and filter changes do not replace a new draft.
- Focused deterministic contracts, mocked desktop/mobile Chromium, and full offline baseline pass.

## Boundaries
No commits, runtime-data writes, external services, or candidate activation. Browser tests use mocked APIs; modified code is tested on an ephemeral worker-disabled smoke server, never by replacing port 3001.

## Verification Results
- Before the fix, the browser regression failed because New draft became Existing copy on candidate `67c4c8103def7a85827a4cda9c374309c34acf45`.
- After the fix, all three mocked Chromium cases passed against the modified build on ephemeral port 45678: desktop, mobile, and empty list. This includes POST/PATCH, read-only deep links, ordinary selection, pending tags, delayed refresh, and back/forward restoration.
- `node .trellis/verification/copy_library_check.mjs`, focused ESLint, and the complete offline baseline passed, including TypeScript, lint, build, HTTP smoke, and SQLite.
- Port-3001 process 7496 and its candidate SHA remain unchanged; the temporary smoke listener was stopped.
- Separate shared-hook observation, outside this fix: the address bar can retain the initial entryId on the first New click from a deep link, even though the editor stays in create mode and correctly saves with POST. Shared URL-write behavior is unchanged; its cause is pending confirmation.
- Implementation is complete. User approval is still required before committing and activating the fixed candidate.
