# Implementation

1. Add shared batch collection request/result/failure types.
2. Implement normalized, role-aware batch collection domain operations in `src/lib/library-assets.ts`.
3. Add authenticated `POST /api/library/assets/batch` route with explicit error responses.
4. Add the route-local collection manager, busy state, result feedback, and responsive styles to `/library`.
5. Extend deterministic library checks and add a mocked Playwright desktop/mobile collection-management check.
6. Run focused library checks, TypeScript, lint, build, and the full `.trellis/verification/check.ps1` baseline.
7. Record the stable API contract in FluxPost decisions, update status/task evidence, commit the verified tree, then activate the clean port-3001 candidate and run the browser check.

## Validation Commands

```powershell
node .trellis/verification/library_assets_check.mjs
node .trellis/verification/vehicle_library_check.mjs
npx --no-install tsc --noEmit
npm run lint
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
npm run local
node .trellis/verification/library_collection_batch_browser_check.mjs
```

## Risk And Rollback Points

- Validate all target collections before the first asset save so a bad target cannot cause partial target application.
- Keep per-asset failures explicit; do not hide permission or persistence errors behind a success total.
- Do not start `npm run local` until focused and full checks pass, Trellis records are complete, and the changes are committed.
