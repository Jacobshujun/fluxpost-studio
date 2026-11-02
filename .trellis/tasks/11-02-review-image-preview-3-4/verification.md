# Verification: Review Image Preview 3:4 Ratio

Date: 2026-11-02
Tree: uncommitted worktree on branch `local`

## Changed Files

- `src/app/globals.css` — image previews use `3 / 4`; video previews keep
  `4 / 3`; the first-image `16 / 9` hero rules are removed; the `>=960px`
  gallery track minimum is `112px`; the index badge sits at the bottom-left of
  image previews (top-left on video tiles) and the preview is a positioning
  context; the primary tile keeps an accent border.
- `.trellis/verification/review_usability_browser_check.py` — asserts every
  image preview and the primary preview compute to `3 / 4`; asserts the
  primary tile has the same width as a normal tile; uses a rectangle-overlap
  helper for badge/tools; adds a video-tile ratio and badge-position case.
- `.trellis/verification/review_performance_browser_check.py` — waits for the
  lazy-loaded preview image to finish before asserting `naturalWidth > 0`.

## Commands And Results

| Check | Result |
| --- | --- |
| Baseline `check.ps1` on smoke port 45678 | Pass: 152 sections plus final pass (lint 0 errors/16 pre-existing warnings, TypeScript, Next build, config sync, HTTP smoke, SQLite) |
| `python .trellis/verification/review_usability_browser_check.py` | Pass: 45 three-theme layout cases, 2 series cases, 1 video case, simulated classic scrollbar, interactions, drag, edge autoscroll and save/reload |
| `python .trellis/verification/review_performance_browser_check.py` | Pass twice: 1440/1000 posts and 390/10000 posts; input P95 13.2-15.1ms, click P95 13.7-14.7ms |
| `python -m py_compile` on both changed browser checks | Pass |

Logs:

- `test-artifacts/review-ratio-baseline-final.log`
- `test-artifacts/review-ratio-browser-check-final.log`
- `test-artifacts/review-ratio-performance-final.log`
- `test-artifacts/review-ratio-performance-repeat.log`

Screenshots:

- `test-artifacts/review-ratio-{professional,editorial,creator}-{1280x720,1440x900,1920x1080,390x844}.png`

Browser fixtures ran only on `127.0.0.1:45678` with background workers
disabled. Port 3001 was not used.

## Measurements

- 1440x900: four columns of 119.03px; four portrait tiles of 253.70px are
  fully visible in the 506px gallery pane.
- 1920x1080: four columns of 133.33px; all four tiles visible in the 689px pane.
- 1600x1000: three columns of 140.95px; all four tiles visible in the 610px
  pane across two rows.
- 1280x720: three columns of 136.83px; three tiles visible in the 329px pane
  (the suite requires at least two).
- 390x844: single column, no horizontal overflow.

## Check Findings Fixed

1. **Landscape previews cropped 3:4 images.** Changed the image preview from
   `4 / 3` to `3 / 4` and removed the `16 / 9` first-image hero. The 960px
   review thumbnail is a square `contain` canvas, so `cover` in a 3:4 box
   crops the transparent side padding, not the image.
2. **Narrow portrait tracks made the index badge overlap the tools.** Moved
   the image badge to the bottom-left of the preview and made the preview a
   positioning context; image cards stay `112px` minimum so 1440x900 keeps four
   images on one screen.
3. **Video tiles would have lost their badge position.** Restored the video
   badge to the top-left, where the single delete button cannot overlap it, and
   added a video-tile case so the exception is covered.
4. **Ratio assertion sampled only one preview.** Replaced it with an
   `evaluate_all` check over every image preview plus an explicit primary
   check and an equal-width primary assertion.
5. **Performance suite had a lazy-load race at 390px.** Added an explicit
   `img.complete && naturalWidth > 0` wait; two consecutive runs pass.

## Known Tradeoffs

- The first image no longer spans two columns; it keeps a subtle accent border
  and the index badge as primary emphasis. A wide hero cannot stay 3:4 without
  becoming taller than the pane.
- Non-3:4 images are still displayed in a 3:4 card with `cover`; the large
  preview dialog remains `contain` and shows the full image.
- At an exact 112px track (roughly a 1380px viewport), the leftmost tool button
  can lose about 2px of its background; the icon and click target remain
  visible. No tested viewport lands exactly on 112px.

## Not Fixed

- Real authenticated visual review on port 3001 remains an operator gate.
- `src/app/review/page.tsx:1566-1567` video aria-labels remain pre-existing
  mojibake in HEAD, out of scope.
