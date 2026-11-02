# Implementation Plan

## Preconditions

- Review `prd.md`.
- Activate the task with `python ./.trellis/scripts/task.py start` before edits.
- Working tree is clean on branch `local`.

## Steps

1. **Gallery preview ratio** in `src/app/globals.css`
   - Change the image preview to `aspect-ratio: 3 / 4`.
   - Scope the change so `.review-video-tile` previews keep their current ratio.
   - Keep `object-fit: cover`; the square review thumbnail's transparent side padding is what gets cropped for a 3:4 source.

2. **Remove the wide first-image hero**
   - Delete the `16 / 9` primary-preview rules and the two-column/full-row primary spans.
   - Keep `.review-order-item-primary` visual emphasis with a subtle accent border instead of size.

3. **Keep the desktop grid compact**
   - Lower the `>=960px` auto-fill track minimum only as far as needed for four portrait tiles to stay fully visible at 1440x900.
   - Re-check 1280x720, 1440x900, 1512x982, 1600x1000, 1920x1080 and 390x844.

4. **Update browser coverage**
   - In `.trellis/verification/review_usability_browser_check.py`, assert the computed 3:4 ratio for image previews, including the primary tile.
   - Keep the existing visible-tile, no-overflow, prompt-height, filter, drag, series and edge-autoscroll assertions.
   - Do not weaken unrelated checks.

5. **Focused verification**
   - Run the three-theme review browser suite against a worker-disabled loopback fixture on port 45678.
   - Inspect screenshots at 1280x720, 1440x900, 1920x1080 and 390x844 in all three themes.
   - Run the review performance browser check if the gallery change affects measured interactions.

6. **Full baseline**
   - Run `.trellis/verification/check.ps1` with `TRELLIS_SMOKE_PORT=45678`.

7. **Documentation and commit**
   - Record evidence in the task `verification.md`.
   - Update `.trellis/spec/fluxpost/status.md`, `feature_list.json`, and `verification.md` when the outcome is stable.
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

- After step 3: confirm image previews render as 3:4 and the first image is no longer a wide hero.
- After step 4: confirm no existing layout, drag, series or autoscroll assertion is weakened.
- After step 6: no new lint errors, TypeScript errors, or build failures.

## Rollback Points

- CSS ratio and hero only: restore `4 / 3`, the two primary span rules and the track minimum.
- Test change only: restore the original browser assertions.
- Do not roll back review ordering, media locking, approval, publishing, or API contracts.
