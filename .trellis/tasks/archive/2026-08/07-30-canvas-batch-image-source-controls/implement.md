# Implementation plan: Canvas batch image source controls

## 1. Complete the result-page contract

- Replace the local incomplete asset-page type with the existing shared library page contract.
- Build one stable query string for role/search/collection/tags.
- Add request-generation and abort protection for initial loads.
- Add cursor-aware append loading with id deduplication and repeated-request guards.
- Remove the hard-coded 30-item render truncation.

Validation gate:

```powershell
npx --no-install eslint src/app/canvas/page.tsx
npx --no-install tsc --noEmit
```

## 2. Add bulk and range selection

- Import and reuse `selectIdRange`.
- Track and reset a local range anchor.
- Add select-all across every remaining cursor and bulk clear.
- Preserve single-selection behavior for fixed image parameters.
- Render accurate loaded/total/selected status and busy states.

Validation gate:

```powershell
node .trellis/verification/canvas_scheduler_check.mjs
```

## 3. Add preview and bounded browsing UI

- Split tile selection from an explicit Eye preview action.
- Extend the existing Canvas image preview dialog with optional bounded previous/next navigation and arrow-key handling.
- Add bounded scrolling, load-more, preview, bulk-toolbar, empty, and responsive styles.
- Keep dialog focus, Escape close, zoom, original-image link, and referrer policy behavior intact.

Validation gate:

```powershell
python .trellis/tasks/07-30-canvas-batch-image-source-controls/browser_check.py
```

## 4. Deterministic and responsive verification

- Extend `canvas_scheduler_check.mjs` with source assertions for cursor consumption, all-result rendering, bulk clear/select, range helper reuse, preview affordance, and bounded scrolling.
- Add a mocked Canvas browser check covering more than 30 items, load-more/scroll behavior, select-all, bulk clear, range selection, fixed single selection, condition-mode preview, modal navigation, and desktop/mobile overflow.
- Run scoped checks, then the documented full baseline.
- Run `npm run local:restart` so the production server on port 3001 reflects the change, then verify `/canvas` responds.

Completion commands:

```powershell
node .trellis/verification/canvas_scheduler_check.mjs
npx --no-install eslint src/app/canvas/page.tsx
npx --no-install tsc --noEmit
npm run build
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
npm run local:restart
```

## Rollback points

- `src/app/canvas/page.tsx`: revert only the scheduler asset editor and optional preview-navigation extension.
- `src/app/globals.css`: revert only `.canvas-schedule-*` additions made by this task.
- Verification additions are isolated to the scheduler check and this task directory.
