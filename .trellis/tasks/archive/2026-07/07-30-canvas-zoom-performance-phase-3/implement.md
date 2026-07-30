# Implementation Plan

## Implementation

- [x] Add the Canvas-scoped stable compositor hint to the React Flow viewport in `src/app/globals.css` without changing existing detail or movement selectors.
- [x] Extend `.trellis/verification/canvas_workflows_check.mjs` with the exact selector/property contract and guards against media placeholder/remount logic.
- [x] Add a task-local mocked Chromium check using the existing 80-node fixture pattern. Record wheel/transform/frame/long-task telemetry and assert the viewport-owned `WillChangeTransform` layer, unchanged node geometry, stable media DOM identity, no duplicate media requests, tier behavior and console health.
- [x] Update only durable FluxPost rendering/verification facts if the implementation and evidence pass.

## Validation

- [x] `node .trellis/verification/canvas_workflows_check.mjs`
- [x] `npx --no-install tsc --noEmit`
- [x] Scoped ESLint for changed TypeScript/JavaScript files
- [x] `git diff --check`
- [x] `python ./.trellis/scripts/task.py validate 07-30-canvas-zoom-performance-phase-3`
- [x] `npm run build`
- [x] `npm run local:restart`
- [x] Task-local mocked Chromium check against `http://127.0.0.1:3001/canvas`
- [x] `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` (attempted; the wrapper stops before checks because `.trellis/verification/check.mjs` is absent)

## Risk And Isolation

- Preserve all unrelated working-tree changes, especially scheduler additions already present in `page.tsx`, `globals.css`, Canvas verification, and FluxPost specs.
- Stage final work as an isolated patch against `HEAD`; never stage whole overlapping files.
- Browser checks intercept all `/api/**` and fixture media requests and must not mutate PostgreSQL, providers, Feishu, production, or real local Canvas data.
- Reject the change if LayerTree does not attribute a viewport-owned layer to `WillChangeTransform`, node/media identity changes, canvas pixels are blank, or geometry/interaction regresses.
