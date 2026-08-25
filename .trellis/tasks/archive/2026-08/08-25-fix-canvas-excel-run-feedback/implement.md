# Implementation Plan

1. Add Canvas run blocker codes and a latest-node-attempt projection type.
2. Add workflow-filtered run and all-status node-attempt database queries for PostgreSQL and SQLite.
3. Extend ordinary run planning with competitor-workbook test readiness while preserving frozen scheduler graphs and unrelated targeted branches.
4. Extend run history response/service with `latestNodeAttempts` and workbook path redaction.
5. Update Canvas run controls to wait for autosave, show immediate progress, block duplicates, and render the actionable workbook notice.
6. Update node result selection so latest failure/wait status persists while prior successful artifacts remain available; preserve explicit historical selection.
7. Add focused deterministic coverage for readiness, query ordering, response redaction, save/run behavior, latest attempts, network wait display, and compatibility boundaries.
8. Run `canvas_workflows_check`, `competitor_workbook_canvas_check`, `image_transport_check`, `canvas_scheduler_check`, and `canvas_image_each_check`, then the complete baseline from `verification.md`.
9. Run `trellis-check`, update stable task/status evidence, commit the scoped work, and confirm a clean tree.
10. Activate clean HEAD through `npm run local`, verify identity on port 3001, and run mocked desktop/mobile browser checks without provider or Feishu writes.

## Review Gates

- No provider request is made for a missing workbook snapshot.
- Workflow filtering occurs before the history limit in both database backends.
- Latest attempts include failure/wait statuses; isolated execution reuse remains successful-output-only.
- Workbook local paths never reach browser responses.
- Scheduler/review/Feishu production code is unchanged except for compatible shared types if required.

## Validation Commands

```powershell
node .trellis/verification/canvas_workflows_check.mjs
node .trellis/verification/competitor_workbook_canvas_check.mjs
node .trellis/verification/image_transport_check.mjs
node .trellis/verification/canvas_scheduler_check.mjs
node .trellis/verification/canvas_image_each_check.mjs
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```
