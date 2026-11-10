# Canvas Switch Any

## Goal and approved requirements
Add Switch Any (index selection), preserving existing upstream scheduling.
- R1: value0 initially; one spare after highest connected value, stable holes/IDs after deletion, trailing empty ports shrink. Existing whole-graph edge budget only, no 16/20 cap.
- R2: one any value output; mixed inputs, exact artifact/metadata preservation and switch chaining.
- R3: zero-based manual index default 0, minus/input/plus. Connected unsigned integer text takes priority, disables but retains manual value. Missing connected result never falls back. No numeric node.
- R4: invalid/empty/negative/fractional/out-of-range indices or missing selected values error. Runtime destination type validation precedes any external side effects.
- R5: existing scheduling and failures propagate normally; bypass selects, disabled follows existing rules; old prompt switch unchanged.
- R6: copy/paste, undo/redo, persistence, portable workflows, iteration internals and reuse work. Iteration aggregate types remain text/images.
- R7: screenshot-style compact layout in existing themes; controls isolate canvas gestures/shortcuts.

## Acceptance
Offline tests cover R1-R6 including >20 inputs, holes, mixed metadata, errors, chains, modes, reuse and iteration. Browser checks cover R1/R3/R6/R7 on desktop/mobile in all three themes using fixtures. Full deterministic baseline passes without real services/data writes. Verified commit activated on primary-worktree port 3001, /api/version matches HEAD. No remote deployment.

## Approval
User approved the full plan and requested implementation on 2026-11-10. Operator acceptance remains separate.
