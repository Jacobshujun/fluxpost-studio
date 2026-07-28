# Canvas Shortcuts Design

## Boundaries

- Keep the change route-local in `src/app/canvas/page.tsx`; retain the existing `/api/canvas/runs` planning, preflight, enqueue, cancel, ownership, and polling contracts.
- Remove the browser confirmation state and dialog. After a successful plan response, call the existing enqueue function immediately with `confirmed: true` and the planned `confirmationNodeIds`; this preserves the server's immutable-plan acknowledgement without displaying or waiting for a human prompt.
- Remove only CSS and static-check expectations that belonged exclusively to the deleted confirmation dialog.

## Keyboard Commands

- Use the existing document-level keyboard listener and the existing `isEditableClipboardTarget` boundary.
- Handle `Ctrl/Cmd+Alt+Enter` before `Ctrl/Cmd+Enter` so cancellation cannot also enqueue a run.
- Ignore repeat events for run, cancel, save, undo, redo, select-all, duplicate, and quick-add commands.
- Commands call the same route-local functions as their buttons; disabled-state predicates are mirrored before dispatch.
- Preserve native document clipboard events for `Ctrl/Cmd+C/X/V`, React Flow's existing `Delete`/`Backspace` handling, and `Tab` quick-add behavior.
- Add standards-based `aria-keyshortcuts` to save, duplicate, delete, run-all, and cancel buttons. No visible shortcut tutorial is added.

## Edit History

- Store a bounded history of normalized `CanvasGraph` snapshots in refs so history bookkeeping does not redraw the canvas.
- Initialize history from the selected workflow graph and reset it whenever a different workflow is selected.
- Debounce snapshot commits so drag, resize, viewport movement, and inline typing produce meaningful edit steps instead of one entry per browser event.
- Before undo, synchronously commit any pending current graph, then restore the previous snapshot. Redo restores the next snapshot only while no new branch has been created.
- Applying a history snapshot sets nodes, edges, and viewport through existing conversion helpers, clears stale selection, marks the workflow dirty, and skips recording the restoration as a new edit.
- Cap retained entries at 50. When a new edit follows undo, truncate the abandoned redo branch.
- History remains browser-session state; persisted workflow JSON stays unchanged and autosave persists the restored graph normally.

## Compatibility And Risk

- Input, textarea, select, and contenteditable targets retain native keyboard behavior, including IME and multiline Enter.
- Mobile behavior remains unchanged because document shortcuts return early under the existing mobile guard.
- External writes can now enqueue without a human confirmation by explicit product decision. Preflight blockers still fail before enqueue, and deterministic checks must not make live provider or Feishu calls.
- Existing user changes in the canvas page, CSS, and verification script must be preserved while applying this task.

## Rollback

- Reverting the route-local shortcut/history block and restoring the confirmation state/dialog returns the previous interaction without data migration.
