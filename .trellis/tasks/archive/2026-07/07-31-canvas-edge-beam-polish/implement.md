# Canvas Edge Beam Visual Polish Implementation

## Work

- [x] Add the distance-bounded beam profile and duration-aware phase helper.
- [x] Render trail, body, and core paths without changing graph serialization.
- [x] Replace the old two-layer CSS with restrained idle, hover, selected/running, moving, and reduced-motion states.
- [x] Update the deterministic Canvas edge contract and remove obsolete fixed-profile assertions.
- [x] Run focused checks, TypeScript, lint, build, full baseline, local restart, and browser inspection.
- [x] Record verified outcome in Trellis status and archive the completed task.

## Validation

```powershell
node .trellis/verification/canvas_workflows_check.mjs
npx --no-install tsc --noEmit
npm run lint
npm run build
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
npm run local:restart
```

Browser inspection covers dark/light themes, short/long and dense edges, selected/running emphasis, source-to-target travel, viewport movement, reduced motion, and mobile overflow without live provider calls.
