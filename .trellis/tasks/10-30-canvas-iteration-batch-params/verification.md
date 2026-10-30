# Verification: Iteration Batch Parameters

Date: 2026-10-30

## Implementation Evidence

- Initial regression failed before the fix with `Inner prompt: bound node field is not batch-injectable.`
- `canvas_scheduler_check.mjs` passes: region-scoped enumeration, same inner IDs across regions and outer nodes, duplicate/invalid/type checks, image adapter, shared ancestry exclusion, immutable expansion, save/reload/preflight and frozen launch snapshots.
- `canvas_iteration_runtime_check.mjs` passes: injected inner config reaches each durable per-image item's `graphSnapshot`, without mutating the source graph.
- Remaining iteration contract/runs/actions/queue checks pass, including isolated SQLite queue behavior and existing PostgreSQL SQL-shape checks.
- Focused ESLint passes with four pre-existing Canvas warnings and no errors. `npx --no-install tsc --noEmit` passes.

## Baseline And Build

- Ran the required `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` with `TRELLIS_SMOKE_PORT=45678`.
- All context/JSON/domain checks passed. Baseline stopped at the documented 17 existing `no-require-imports` errors in ignored `data/feishu-copy-import` scripts; no rules or ignored user files were changed.
- Re-ran the complete baseline after final test/spec edits: the same domain checks pass and the same lint blocker remains. The compact status update stays within both context budgets; no gate was relaxed.
- Ran the remaining gates separately: TypeScript, `npm run build`, `advanced_config_build_check.mjs`, `db_check.mjs` and `http_smoke.js http://127.0.0.1:45678` passed.
- Local diagnostic logs: `test-artifacts/canvas-iteration-batch-baseline.log`, `test-artifacts/canvas-iteration-batch-baseline-final.log` and `test-artifacts/canvas-iteration-batch-build.log` (untracked runtime artifacts, not commit inputs).

## Browser

- Extended the existing intercepted-API iteration browser suite with main/child inner binding selection, region labels, autosave, reload and shared-output exclusion.
- Updated existing image-control selectors to target the inspector rather than both inspector and inline controls. Updated the stale 4K ratio assertion to preserve the selected 3:4 ratio, matching current model-format behavior; no application ratio behavior changed.
- Full suite passed at 1440px (53 intercepted API requests) and 390px (49 requests), with no page errors, unexpected writes, external requests or horizontal overflow. Retained the existing region editing, repair, refresh, copy/import and shared-lock checks.
- Repeated the full browser suite after adding focused screenshots; both viewports passed again. Visually checked `test-artifacts/canvas-iteration-batch-binding-{1440,390}.png`: region-qualified binding and persisted value remain readable within existing controls.
- Reload while the schedule panel query is open timed out in one run before Canvas loaded; cause remains unconfirmed. This regression closes the panel before reloading, then reopens the saved schedule. General panel deep-link behavior is outside this change.

## Boundaries

- No live providers, publishing calls, production changes or user schedule writes.
- The browser uses a worker-disabled loopback smoke server, with all APIs intercepted. Port 3001 and its candidate remain unchanged.
- The smoke helper left its Windows child listener alive after returning; verified the exact PID/command, stopped only this session's port-45678 Next process, and confirmed that port was released.
- User approved committing this fix and updating the LAN candidate on 2026-10-30, then explicitly authorized removing the unrelated image-text diagnostic status entry. No remote push is authorized.
