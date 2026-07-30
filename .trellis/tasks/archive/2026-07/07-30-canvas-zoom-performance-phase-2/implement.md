# Implementation Plan

## Implementation

- [x] Add viewport detail constants, pure tier projection, and idempotent stage synchronization in `src/app/canvas/page.tsx`.
- [x] Wire synchronization into React Flow init/move lifecycle and explicit workflow/history viewport changes without adding React state.
- [x] Add layout-preserving reduced/overview/moving selectors in `src/app/globals.css` for node media, results, chrome, shadows/filters, resize controls and MiniMap.
- [x] Extend `.trellis/verification/canvas_workflows_check.mjs` with tier projection, idempotence/source-contract, persistence-boundary and CSS-contract assertions.
- [x] Add a task-local mocked Chromium check with an 80-node Fit View fixture, detail-tier transitions, selected-node exception, movement suppression, geometry stability and console checks.

## Validation

- [x] `node .trellis/verification/canvas_workflows_check.mjs`
- [x] `npx --no-install tsc --noEmit`
- [x] Scoped ESLint for changed TypeScript/JavaScript files
- [x] `git diff --check`
- [x] `npm run build`
- [x] `npm run local:restart`
- [x] Task-local mocked Chromium check against `http://127.0.0.1:3001/canvas`
- [x] `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` (attempted; blocked before execution because `.trellis/verification/check.mjs` is absent)

## Risk And Isolation

- Preserve all unrelated working-tree changes, especially the flexible Canvas scheduler additions already present in `page.tsx`, `globals.css`, and Canvas checks.
- Stage the final work as isolated hunks against `HEAD`; do not stage whole overlapping files.
- Browser checks intercept all `/api/**` and media fixture requests and must not mutate PostgreSQL, providers, Feishu, or production.
