# Implementation Plan

## Preconditions

- Review `prd.md` and `design.md`.
- Activate the task with `python ./.trellis/scripts/task.py start` before edits.
- Working tree is clean on branch `local`.

## Steps

1. **Gallery grid CSS** in `src/app/globals.css`
   - Change the `<960px` default to single column.
   - At `>=960px` use `repeat(auto-fill, minmax(170px, 1fr))`.
   - Replace desktop `min-height: 360px/430px` with aspect-ratio plus caps.
   - Add the short-viewport rule that drops the first-tile row span.

2. **Editor split CSS**
   - Set `>=960px` editor columns to `minmax(300px, 1.05fr) minmax(320px, 1fr)`.
   - Remove the now-unreachable `min-width: 1400px` override.
   - Verify the gallery/text panes still scroll independently.

3. **Order controls JSX** in `src/app/review/page.tsx`
   - Remove the detached `tools(position)` row.
   - Render drag/up/down/delete inside `.review-gallery-tools`.
   - Keep all aria-labels, drag handlers and `.review-order-item` classes.
   - Add the same overlay (without delete) to missing series cards.
   - Remove the unused `.review-order-tools` CSS.

4. **Prompt and metadata CSS**
   - Compact idle prompt height with focus expansion.
   - Tighten series metadata without hiding candidate buttons.

5. **Update browser checks**
   - Rewrite the drag assertion for the new grid.
   - Add visible-tile and grid-column assertions.
   - Keep the edge-autoscroll assertion on an overflowing fixture.
   - Refresh screenshots.

6. **Focused verification**
   - Run the fixture browser suite on an isolated loopback port.
   - Run the review performance browser check.
   - Inspect 1280x720, 1440x900, 1920x1080 and 390x844 screenshots in all
     three themes.

7. **Full baseline**
   - Run `.trellis/verification/check.ps1` with `TRELLIS_SMOKE_PORT=45678`.

8. **Documentation and commit**
   - Record evidence in `verification.md` (task artifact).
   - Update `.trellis/spec/fluxpost/status.md` and the
     `review-desk-usability` feature evidence if the outcome changes.
   - Commit only after all checks pass.

## Validation Commands

```powershell
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

```powershell
python .trellis/verification/review_usability_browser_check.py
python .trellis/verification/review_performance_browser_check.py
```

- Browser checks must target a worker-disabled loopback fixture, never 3001.
- No provider, Feishu, or production calls.

## Review Gates

- After steps 1-3: inspect the four desktop screenshots and confirm at least
  two images visible at 1280x720 and four at 1440x900.
- After step 5: confirm drag insertion, duplicate URLs, missing cards,
  candidate selection and saved `imageUrls`/`imagePrompts` still pass.
- After step 7: no new lint errors, TypeScript errors, or build failures.

## Rollback Points

- CSS grid only: restore the single-column override and old tile heights.
- JSX controls: move the three buttons back out of the tile and restore
  `.review-order-tools`.
- Do not roll back order persistence, media locking, or API contracts.
