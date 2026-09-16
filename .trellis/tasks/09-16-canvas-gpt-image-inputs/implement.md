# Implementation

1. Register numbered ports and shared visible-input, aggregation and bypass helpers.
2. Connect executor and planner/run behavior; preserve legacy snapshots.
3. Add dynamic React Flow handles and inline controls, including iteration and quick-add paths.
4. Extend deterministic fixtures and mocked browser coverage; run full baseline.
5. Record verified scope and activation limits in task evidence and lightweight status.

## Approved Commit

`feat: add ordered expanding GPT image inputs on Canvas`

- `src/app/canvas/page.tsx`, `src/app/globals.css`
- `src/lib/canvas/registry.ts`, `executors.ts`, `graph.ts`, `runs.ts`
- `.trellis/verification/canvas_image_each_check.mjs`, `canvas_workflows_check.mjs`, `canvas_iteration_contract_check.mjs`, `canvas_iteration_runs_check.mjs`, `canvas_gpt_inputs_browser_check.py`
- `.trellis/spec/fluxpost/status.md`, `toapis_image_contract.md`
- `.trellis/tasks/09-16-canvas-gpt-image-inputs/`

All dirty paths belong to this task; no unrecognized changes were found. User approved this commit on 2026-09-16. No push or local candidate activation is included. Archive the task after the work commit.
