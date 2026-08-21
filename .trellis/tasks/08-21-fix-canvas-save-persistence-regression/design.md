# Canvas 保存持久化复发设计

## Boundaries

- Browser state and save entry: `src/app/canvas/page.tsx`.
- Save serialization: `src/lib/canvas/workflow-save-coordinator.ts`.
- API and optimistic locking: `src/app/api/canvas/workflows/[id]/route.ts` and `src/lib/canvas/workflows.ts`.
- PostgreSQL/SQLite persistence: `src/lib/database.ts`.
- Deterministic coverage: `.trellis/verification/canvas_workflows_check.mjs`, `.trellis/verification/canvas_save_race_browser_check.py`, plus a focused persistence check if required.

## Diagnostic Contract

Test four discriminating boundaries in order:

1. UI mutation to captured snapshot: prove node/name/viewport edits are present at manual-save time.
2. Captured snapshot to PATCH: prove no busy/queue path silently reports success without a request.
3. PATCH to database: prove accepted revision and graph JSON are written atomically.
4. Database to reload: prove GET returns the saved revision and graph.

Only change the first boundary that violates the contract. Preserve the existing API and schema unless repository evidence proves they are the failing boundary.

## State Contract

- A durable edit increments a monotonic dirty version and synchronously updates the save source of truth.
- A save snapshot is immutable once queued.
- A successful response clears dirty only when its snapshot covers the current dirty version.
- A response may update revision metadata for its workflow but cannot replace another workflow or overwrite newer browser edits.
- Manual save remains explicit: a blocked or failed request resolves false and retains visible unsaved state.

## Compatibility And Rollback

- Existing persisted graphs and revisions remain unchanged.
- No data migration is planned.
- Rollback is limited to the browser save-source change and focused checks; server optimistic locking remains intact.
