# Local Build Slot Design

## Architecture

The primary worktree owns two ignored Next.js output directories: `.next-local-a` and `.next-local-b`. A small ignored state file records the active slot and its full Git SHA. `next.config.ts` uses an allow-listed environment variable to select one of these directories only for the local candidate launcher; ordinary `npm run build` continues to use `.next`, and Docker standalone behavior remains unchanged.

## Activation Flow

1. Resolve and enforce the primary worktree, clean tree, and full `HEAD` SHA.
2. Read the managed local state. Select the other slot, or slot A when no valid state exists.
3. Build the current committed SHA into the inactive slot while the current 3001 listener remains running.
4. Stop the 3001 listener only after the build and post-build clean-tree check pass.
5. Start `next start` with the selected slot, candidate mode, and current SHA.
6. Verify `/api/version` and the existing HTTP smoke, then atomically replace the local state file.

## Failure And Recovery

- Build failure: exit without touching the current listener or active-state record.
- Startup or verification failure: stop the failed listener. If the state file identifies a valid previous slot and SHA, restart it with the same host/config and verify its identity and HTTP health. Leave the state record pointing to the previous slot.
- During the first migration, a valid candidate already listening from the primary worktree's `.next` output is retained as the one-time rollback source. If neither a managed slot nor that legacy primary-worktree candidate exists, report the activation failure explicitly.

## Boundaries

- Slot and state paths are fixed by the launcher; arbitrary output paths are rejected.
- Slot directories and the state file are Git-ignored build/runtime artifacts, not a second collaboration or version-history system.
- The launcher remains the only activation path and retains the clean-tree guard.
- The existing sibling candidate worktree is migration residue. The new launcher must not use it. Removal is a separate recoverable cleanup after the primary runtime is active because the current listener is still using it.
