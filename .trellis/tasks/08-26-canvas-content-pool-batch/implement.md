# Implementation Plan

1. Add a deterministic focused verification script first for selection filtering/paging and V2 snapshot resolution/injection; register it in the Trellis baseline and confirm it fails against current code.
2. Add shared content-pool selection/filter/snapshot types and domain helpers, then expose the authenticated read-only selection route.
3. Extend Canvas V2 parameter/source/value/adapter unions, registry binding metadata, normalization, preflight resolution, validation, and frozen-value injection.
4. Replace the normal content-pool native select with the shared filtered card picker and add the scheduler manual/match source editor.
5. Add compact responsive styles, accessible labels/focus/loading/error states, and content preview integration.
6. Run the focused checks, Canvas workflow and scheduler checks, TypeScript, lint, build, and the full offline Trellis baseline.
7. Verify the mocked authenticated UI at 1440x960 and 390x844 without live provider or publish calls; update Trellis status/evidence only with confirmed results.

## Risk and Review Gates

- Keep source filtering owner-scoped and server-authoritative; never trust ids returned by the client.
- Reuse one snapshot projection for normal selection and batch injection so their media precedence cannot drift.
- Confirm preview persistence contains compact snapshots only and no `raw`, credentials, local paths, or owner-private data beyond existing Canvas records.
- Confirm autosave commits one batch selection update rather than one write per cursor row.
- Do not run `npm run local` until changes are verified and committed, per the port-3001 candidate rule.

## Validation Commands

```powershell
node .trellis/verification/canvas_content_pool_selection_check.mjs
node .trellis/verification/canvas_workflows_check.mjs
node .trellis/verification/canvas_scheduler_check.mjs
npx --no-install tsc --noEmit
npm run lint
npm run build
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```
