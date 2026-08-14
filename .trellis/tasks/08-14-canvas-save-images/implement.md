# Implementation Plan

## Test First

- [x] Extend `canvas_workflows_check.mjs` with failing contracts for node registration, graph inclusion, prefix validation, executor 1/30/31 boundaries, deep clone, UI wiring and old-workflow compatibility.
- [x] Add a focused image-download check for run/node/index ownership projection, filename/content-disposition helpers, real image sniffing, non-image rejection, route authentication and no raw URL parameter.
- [x] Run the focused checks and confirm the new assertions fail for the missing feature.

## Backend And Canvas Domain

- [x] Add the Canvas node type, registry entry, validation and executor.
- [x] Implement pure image-download projection/filename helpers and the authenticated streaming route with bounded materialization and cleanup.
- [x] Keep the route thin and reuse `getCanvasRun`, `materializeRuntimeMedia` and `sniffImageFormat`; add no persistence schema or dependency.

## Frontend

- [x] Add the Download icon mapping and save-node result component using the existing compact Canvas result language.
- [x] Implement serial fetch/blob downloads, RFC 5987 filename parsing, busy protection, per-item continuation and final success/failure feedback.
- [x] Add narrowly scoped CSS for the command row and progress feedback; preserve mobile layout without claiming mobile multi-download support.

## Verification And Release

- [x] Run focused Canvas/download checks, changed-file lint and TypeScript.
- [x] Run the complete baseline with `TRELLIS_SMOKE_PORT=45678`.
- [x] Run `npm run local:restart` and perform desktop Chrome/Edge single/multi/partial-failure/history download checks without providers.
- [ ] Update stable Canvas spec/status/feature evidence only with confirmed results, run `trellis-check`, review scope/secrets/runtime files, commit and push the exact candidate.
- [ ] Verify remote SHA equality, run VPS fixed-SHA candidate verification and read-only preflight, then present evidence for separate production approval.
- [ ] After approval only, deploy the exact SHA, verify identity/health/auth/workers/volumes/Nginx/logs/rollback, and fast-forward `main` normally.

## Stop Conditions

- Dirty-root changes would be required or candidate scope cannot remain isolated.
- Any test/build/baseline/browser/candidate/preflight gate fails.
- A secret, runtime row/media file, browser profile or unrelated task artifact enters the candidate.
- Production has active work, rollback cannot be identified, remote main moves incompatibly, or separate deployment approval is absent.
