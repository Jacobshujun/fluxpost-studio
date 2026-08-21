# Implementation Plan

1. Add a deterministic reproduction for node/config edits saved before the next React render and for real write/read persistence.
2. Trace the failing boundary through snapshot capture, coordinator queue, PATCH response and database reload.
3. Apply the smallest fix that makes the latest graph the synchronous save source of truth while preserving serialized requests and revision chaining.
4. Extend mocked browser coverage from name-only edits to graph edits and refresh/reload behavior.
5. Run focused Canvas checks, TypeScript, lint, build and the complete offline Trellis baseline.
6. Update stable FluxPost status/spec facts only if the verified contract changes, commit the task, then activate the clean candidate on port 3001 and verify identity plus `/canvas` HTTP.

## Validation Commands

- `node .trellis/verification/canvas_workflows_check.mjs`
- `python .trellis/verification/canvas_save_race_browser_check.py`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`
- `npm run local`

## Risk And Rollback Points

- Do not mutate or expose existing workflow content during diagnosis.
- Any real persistence fixture must use a generated owner/workflow id and remove its row in `finally`.
- Stop before port-3001 activation unless the worktree is clean and committed, per the local candidate guard.
