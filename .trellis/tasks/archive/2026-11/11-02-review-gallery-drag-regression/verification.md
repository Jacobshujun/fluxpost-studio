# Verification: Review Gallery Drag Regression

Date: 2026-11-02
Tree: uncommitted worktree on branch `local`

## Fix

- `src/app/review/page.tsx`: the image fieldset uses `disabled={locked}`.
  Disabling it on `dragstart` disabled the drag handle and applied
  `pointer-events: none`, cancelling native drag. The regenerate button now also
  disables while `drag !== null`.
- `.trellis/verification/review_usability_browser_check.py`: asserts the
  fieldset stays enabled after `dragstart`, the handle stays enabled and
  draggable, and up/down/delete/regenerate are disabled.

## Commands And Results

| Check | Result |
| --- | --- |
| `npm run lint` | Pass, 0 errors, 16 pre-existing warnings |
| `npx --no-install tsc --noEmit` | Pass |
| Baseline `check.ps1` on smoke port 45678 | Pass, 153 logged steps |
| `review_usability_browser_check.py` | Pass: 45 layout cases, interactions, native mouse drag, series, classic scrollbar, edge autoscroll |
| Headed Chrome real-mouse drag | Pass: mid-drag fieldset enabled with `pointer-events: auto`; up/down/delete/regenerate disabled; handle 1 to tile 3 reordered prompts; save and reload preserved order; series card moved past the missing card |

Logs:

- `test-artifacts/review-gallery-drag-baseline.log`
- `test-artifacts/review-gallery-drag-browser-check.log`
- `test-artifacts/review-gallery-drag-headed.png`

## Not Fixed

- `src/app/review/page.tsx:1566-1567` pre-existing video aria-label mojibake.
  Out of scope.
