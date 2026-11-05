# Independent local runtime

User approved executing the proposed editor-lifetime fix after the Nov 5
investigation; earlier explicit request raises the local Node heap to 24 GiB.

## Requirements
- Closing the editor/command host must not terminate the managed local server.
- Keep the existing primary-worktree, clean committed candidate, LAN binding,
  diagnostics, identity verification and rollback behavior.
- Reject environments that cannot create an independent process before
  replacing the current listener.
- Apply a 24-GiB local server heap ceiling; do not preallocate it.
- Verify, commit and activate the local candidate after passing checks.

## Acceptance
- [x] Actual launcher survives containing Job closure; diagnostics still capture child exit.
- [x] Disallowed breakaway fails explicitly; arguments/environment/paths preserved.
- [x] Real V8 heap probe confirms 24 GiB without allocating that amount.
- [x] Full baseline passes; clean committed LAN activation and identity pass.

No automatic restart, job replay, cache purge, paid test or remote deployment.
