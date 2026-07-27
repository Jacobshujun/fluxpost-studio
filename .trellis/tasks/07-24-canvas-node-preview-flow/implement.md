# Canvas Node Editing And Preview Polish Implementation

## Ordered Work

- [x] Add the route-local node interaction/run context and highest-attempt projection.
- [x] Add the controlled inline text-node editor with canvas gesture and shortcut isolation.
- [x] Automatically load the newest run while preserving explicit run selection and polling behavior.
- [x] Add inline model status/output rendering and text/image/video full-preview dialogs.
- [x] Replace repeated edge dashes with a continuous base and single phase-shifted moving beam.
- [x] Add responsive, theme, selected-edge, and reduced-motion styling.
- [x] Extend the canvas deterministic check for the new contracts and removal of the old dash pattern.
- [x] Run focused check, TypeScript, lint, build, full baseline, local restart, and mocked desktop/mobile browser verification.
- [x] Update Trellis status/evidence only with verified facts.

## Validation

```powershell
node .trellis/verification/canvas_workflows_check.mjs
npx --no-install tsc --noEmit
npm run lint
npm run build
$env:TRELLIS_SMOKE_PORT='45678'; powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
npm run local:restart
```

Browser verification uses mocked canvas APIs at 1440x960 and 390x844. It must cover inline typing, inspector synchronization, run-history projection, typed output dialogs, continuous edge pixels, themes, and reduced motion without live provider calls.

## Risk And Rollback

- Keep edits localized to `src/app/canvas/page.tsx`, `src/app/globals.css`, and `.trellis/verification/canvas_workflows_check.mjs`.
- Preserve the current run dock and existing image viewer while adding node-level entry points.
- If inline preview state causes graph serialization changes, stop and correct the context boundary rather than adding compatibility fallbacks.
