# Implementation Plan

## Steps

- [x] Add the optional node-size contract and shared min/max bounds in the Canvas domain types.
- [x] Validate persisted node sizes in graph validation and preserve validated sizes in clipboard parsing/instantiation.
- [x] Map persisted dimensions into React Flow, render desktop-only `NodeResizer`, and serialize custom dimensions through `currentGraph`.
- [x] Update node layout/CSS so resizable nodes fill assigned dimensions, inner content scrolls safely, ports remain visible, and mobile retains its current fixed layout.
- [x] Extend `.trellis/verification/canvas_workflows_check.mjs` with graph, clipboard, page wiring, bounds, legacy compatibility, and mobile lockout assertions.
- [x] Run focused checks and browser verification at desktop and mobile sizes without external calls.
- [x] Run the full verification baseline, restart the local production server, and update Trellis state/evidence.

## Result

- Focused Canvas check, TypeScript, focused lint, production build, `npm run local:restart`, HTTP smoke, and mocked Chromium desktop/mobile checks passed.
- The full baseline passed every deterministic check through Canvas, then stopped at the unrelated untracked `.tmp-canvas-common-nodes-browser-check.cjs` lint error. That user-owned file was preserved.

## Verification

```powershell
node .trellis/verification/canvas_workflows_check.mjs
npx --no-install tsc --noEmit
npm run lint
npm run build
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
npm run local:restart
```

Browser verification must cover mouse resizing from a corner and edge, min/max constraints, autosave/reload persistence, copy/paste preservation, edge alignment, text/image/result overflow, and absence of resize controls at `390x844`. Mock Canvas APIs or use isolated local records; do not invoke model, Seedance, TikHub, ComfyUI, Feishu, Lark, or other external production services.

## Risk And Rollback Points

- `src/app/canvas/page.tsx`: React Flow may report measured dimensions for legacy content-driven nodes; only explicitly resized/persisted dimensions should become durable.
- `src/app/globals.css`: fixed-height media/result blocks can overflow a short node, so scroll ownership must be explicit and verified visually.
- `src/lib/canvas/clipboard.ts`: keep version 1 compatible by making size optional and validating it before preservation.
- `src/lib/canvas/graph.ts`: layout validation must not change DAG execution behavior.
