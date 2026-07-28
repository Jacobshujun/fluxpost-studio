# Canvas Shortcuts Implementation

## Checklist

- [x] Extend `.trellis/verification/canvas_workflows_check.mjs` with failing assertions for direct enqueue, removal of confirmation UI, shortcut guards, button accessibility metadata, and bounded history helpers.
- [x] Add pure route-local history helpers and integrate debounced graph snapshots, undo, redo, workflow reset, redo-branch truncation, and the 50-entry cap.
- [x] Extend the existing desktop keydown handler with run, cancel, save, undo, redo, and select-all commands while preserving editable-target, mobile, clipboard, delete, and quick-add behavior.
- [x] Remove confirmation UI/state and route every successful plan directly through the existing enqueue path.
- [x] Remove unused confirmation imports/helpers/styles and add `aria-keyshortcuts` to existing command buttons.
- [x] Run focused checks, review the diff for overlap with existing user changes, then run the full project completion baseline and local production restart.
- [x] Update lightweight Trellis status and feature evidence only after verification establishes the final outcome.

## Validation

```powershell
node .trellis/verification/canvas_workflows_check.mjs
npx --no-install tsc --noEmit
npx eslint src/app/canvas/page.tsx .trellis/verification/canvas_workflows_check.mjs
npm run build
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
npm run local:restart
```

Use the existing mocked canvas browser harness or an equivalent local Playwright check at 1440x960 and 390x844. Verify shortcut dispatch and editable-target isolation with mocked canvas APIs; do not enqueue real paid or external-write work.

## Verification Result

- Focused canvas check, TypeScript, focused lint, production build, local restart, and mocked 1440x960/390x844 browser checks passed without external calls.
- The full Trellis baseline passed every check through the canvas suite, then stopped at lint only because the pre-existing untracked `.tmp-canvas-common-nodes-browser-check.cjs` uses a forbidden CommonJS import. That user-owned artifact was preserved.

## Risk And Rollback Points

- `src/app/canvas/page.tsx`, `src/app/globals.css`, and `.trellis/verification/canvas_workflows_check.mjs` already contain unrelated uncommitted work. Preserve it and inspect scoped diffs rather than restoring files.
- If history grouping is unstable, stop before broadening the feature; do not ship event-per-frame undo entries or silent state loss.
- Do not change server confirmation, queue, provider, database, or workflow serialization contracts for this task.
