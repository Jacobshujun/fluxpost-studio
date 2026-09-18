# Verification — 2026-09-18

## Completed
- `node .trellis/verification/canvas_workflows_check.mjs`: measured containment, mixed mode toggles/protected root/unsupported bypass, old/new graph decoding, file and clipboard round trips, fresh frame ids, invalid frame rejection, unchanged plans and execution definitions pass.
- `node .trellis/verification/canvas_iteration_runtime_check.mjs`: real fingerprint projection preserves in-flight identity when groups are added/renamed. Existing runtime and runs checks pass.
- Final full baseline: `$env:TRELLIS_SMOKE_PORT='45678'; powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`, exit 0, `Baseline verification passed`. Includes Trellis budget/contract checks, offline domains, lint (existing warnings only), tsc, production build (existing tracing warnings), isolated HTTP and SQLite. Local log: ignored `.tmp-canvas-groups-baseline-final.log`.
- `python .trellis/verification/canvas_groups_browser_check.py`: professional/editorial/creator at 1440x1000 and 390x1000 pass. Real mouse/key checks cover Shift toggles, empty/mixed selections, multi-drag, G/B/M, rename/color, group movement/resize, full-containment drag-out/in, single-step undo/redo, group clipboard and deletion, native/ARIA dialog isolation, root protection, reload and outer/inner export/import. Screenshots in ignored `test-artifacts/canvas-groups-*.png`; API writes are in-memory only.
- `$env:CANVAS_ITERATION_INTERACTIONS_ONLY='1'; python .trellis/verification/canvas_iteration_browser_check.py`: 1440/390 pass for inner handles, connections, protected input and nested deletion; outer nodes/edges remain intact.
- Legacy complete iteration browser script additionally reaches an unrelated ambiguous `get_by_label("比例")` selector (both node and inspector expose it). Its default test remains intact; only an explicit interaction-only option was added. New groups suite has no such ambiguity.

## Delivery
- Implementation commit: `126a3af689d6a71692f00d946a6c5c8944e4e9db`.
- `npm run local:lan` from the clean primary worktree passed (exit 0), including build and port-3001 HTTP smoke. Read-only `/api/version` returned the same full commit with `mode=candidate, versioned=true`; `/canvas` returned HTTP 200; listener stayed `0.0.0.0:3001`.
- Final documentation/archive commit changes no application code and is activated through the same wrapper. Current receipt is the ignored `.fluxpost-local-candidate.json` plus `/api/version`; detailed activation logs are ignored `.tmp-canvas-groups-local*.log`.
- No live providers, publishing, runtime-row migration or remote deployment requested/exercised. Operator acceptance remains pending.
