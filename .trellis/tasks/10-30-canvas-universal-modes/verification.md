# Universal Canvas Modes Verification

Date: 2026-10-30

## Implementation

All node menus, outer/inner inspectors and bulk commands now expose enabled/disabled/bypass, including fixed iteration roots. Root patches only accept mode changes; config/position/deletion protections remain. Registry routing preserves explicit mappings and numbered GPT/Wonder alternatives, otherwise requires one compatible available input port per output. Missing/ambiguous routes and mismatched actual artifacts produce explicit node/output errors. Outputless sinks bypass without side effects. Workers never fall back to executing/reusing disabled/bypass nodes. V2 data-only source-video/content-pool/video injection preserves mode; completed-result literal materialization is unchanged.

Canonical contract: `.trellis/spec/fluxpost/canvas_execution_modes.md`. No schema, API-shape, provider, layout or runtime-data migration.

## Deterministic Evidence

- Pre-fix tests failed on skipped source/root toggles and prohibited root-mode persistence. Fixed checks execute real registry/graph/serialization/runtime/editor-patch code, not a replacement route algorithm.
- `canvas_workflows_check.mjs`: all retrievable registered versions accept both modes; export/import drafts preserve them. Single compatible concat input passes, two input ports report ambiguity; source bypass blocks; outputless save sink produces empty bypassed receipts. Typed mismatch/opaque multi-value rejection, audio merge, split forwarding, non-mutation, ordinary/isolated planning, no executor/provider/reuse calls, injected-root modes and immutable root fields pass.
- `canvas_iteration_contract_check.mjs`: disabled/bypass roots and disabled selected outputs save; unavailable selected/required outputs prevent execution before billable inner capabilities. Real serialization round trips pass.
- `canvas_scheduler_check.mjs`: source-video/content-pool/video parameter adapters preserve disabled/bypass; disabled/bypassed source blocks its required dependent. Successful source-video fixture explicitly enables its source, rather than relying on implicit re-enabling.
- Existing iteration runtime/runs/actions/queue, Gemini, GPT per-image/numbered references and Wonder runtime/persistence checks pass in the full domain baseline. The reference-input required-port API remains backward compatible.

## Browser / Build Evidence

- `canvas_execution_modes_browser_check.py`: six three-theme 1440/390 cases pass. Source/concat/save menus and inspectors, planning error display with no enqueue, mode persistence/reload, desktop keyboard/undo/redo, inner root menus/inspector and saved root mode pass.
- `canvas_groups_browser_check.py`: six cases pass, including root mode toggling with a group, retained fixed-root position, selection, group gestures, copy/paste, undo and modal/typing shortcut guards.
- `canvas_text_viewport_browser_check.py`: six cases pass. `canvas_node_status_browser_check.py`: 60 state/layout cases pass. No changes to the previous viewport/compact-status repairs.
- All browser checks use fully intercepted APIs on worker-disabled loopback 45678; no real workflow, provider or publishing writes.
- Documented full baseline: context/JSON and all domain checks pass, then the existing 17 errors in ignored local data scripts stop ESLint. No gate changed. Source/script/changed-check lint has zero errors and 16 existing warnings. `tsc --noEmit`, production build, built config synchronization, read-only SQLite and isolated HTTP smoke pass.
- `git diff --check` passes. Startup/task context remains within existing limits.

## Delivery

User authorized automatic commit and LAN activation. Promote only clean primary-worktree HEAD through `npm run local:lan`; verify full runtime/receipt/slot SHA, `0.0.0.0:3001`, loopback/LAN HTTP smoke and `/canvas`. Activation results are recorded after the command. No push or remote production deployment.
