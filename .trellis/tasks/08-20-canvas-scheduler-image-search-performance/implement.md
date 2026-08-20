# Implementation plan: Canvas scheduler image search performance

1. Add the versioned thumbnail cache service, dedicated concurrency pool, authenticated route, direct Sharp dependency, and explicit prewarm CLI.
2. Refactor `ScheduleAssetFilterEditor` to use a 350 ms local search draft, stale-visible fetches, 24-item explicit pagination, id-only select-all completion, and thumbnail tile states.
3. Extend deterministic library/Canvas checks and the task-local mocked browser check for debounce, request counts, stale results, explicit paging, thumbnails, selection, preview, and responsive behavior.
4. Run focused checks, scoped lint, TypeScript, build, and the documented complete offline baseline.
5. Present the Trellis commit plan. After approved commits, run the explicit thumbnail prewarm, restart the clean committed port-3001 candidate, and verify `/canvas`.

## Verification

```powershell
node .trellis/verification/library_thumbnails_check.mjs
node .trellis/verification/canvas_scheduler_check.mjs
python .trellis/tasks/08-20-canvas-scheduler-image-search-performance/browser_check.py
npx --no-install eslint src/app/canvas/page.tsx src/lib/library-thumbnails.ts src/app/api/library/assets/[id]/thumbnail/route.ts
npx --no-install tsc --noEmit
npm run build
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

## Boundaries

- Preserve unrelated dirty changes in `src/lib/canvas/executors.ts` and `.trellis/verification/canvas_workflows_check.mjs`.
- Do not call AI, Feishu, paid providers, or TOS writes.
- Do not restart port 3001 until the verified work is committed.
