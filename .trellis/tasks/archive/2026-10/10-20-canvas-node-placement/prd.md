# Canvas node placement

## Requirement

Nodes added from the left node library must appear where the user was pointing in the visible canvas, accounting for pan and zoom, instead of fixed graph coordinates. The user confirmed the left library is the affected entry point.

## Acceptance

- A library click uses the most recent pointer location in the canvas; with no usable pointer location it uses the visible canvas center.
- Screen positions convert through the current React Flow viewport. Node count never determines insertion coordinates.
- Right-click and connection quick-add retain their explicit insertion positions.
- An empty canvas's first addition remains at its requested position.
- Existing selection, inspector, undo/save and read-only mobile behavior remain intact.
- Browser checks use intercepted APIs and an isolated worker-disabled server; no runtime workflows or providers are called.
- Run the documented baseline, report any unchanged blockers, and verify the local candidate after clean committed activation.

## Scope and validation

Lightweight bug fix in `src/app/canvas/page.tsx`, focused browser regression under `.trellis/verification/`, task evidence and lightweight status. Validate actual node screen bounds across pan/zoom, palette and quick-add paths, empty/nonempty graphs and desktop widths; keep existing mobile checks.
