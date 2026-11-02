# Verification: Review Image Gallery Layout

Date: 2026-11-02
Tree: uncommitted worktree on branch `local`

## Changed Files

- `src/app/review/page.tsx` — overlay ordering controls, primary item marker,
  series gallery class.
- `src/app/globals.css` — multi-column gallery, tile/preview sizing, hero and
  container rules, compact prompt, compact series metadata, 24px overlay tools.
- `.trellis/verification/review_usability_browser_check.py` — new layout,
  scrollbar, series, reduced-motion and edge-autoscroll coverage.

## Commands And Results

| Check | Result |
| --- | --- |
| `npm run lint` | Pass, 0 errors, 16 pre-existing warnings |
| `npx --no-install tsc --noEmit` | Pass |
| Baseline `check.ps1` on smoke port 45678 | Pass, 153 logged steps (lint, TypeScript, Next build, config sync, HTTP smoke, SQLite) |
| `review_usability_browser_check.py` | Pass: 45 layout cases (15 viewports x 3 themes), 2 series layout cases, simulated classic scrollbar, interactions, edge autoscroll |
| `review_performance_browser_check.py` | Pass: 1440/1000 posts and 390/10000 posts; input/click P95 13.6-14.5ms |

Logs:

- `test-artifacts/review-gallery-baseline-final.log`
- `test-artifacts/review-gallery-browser-check-final.log`
- `test-artifacts/review-gallery-performance-final.log`

Browser fixtures ran only on `127.0.0.1:45678` with background workers
disabled. Port 3001 was not used.

## Check Findings Fixed

1. **960px classic scrollbar collapsed the grid to one column.** Headless
   Chrome overlay scrollbars hid the 15px classic scrollbar. Lowered the track
   minimum to 145px, overlay insets to 6px and gaps to 2px; added a simulated
   classic-scrollbar case. Headed Chrome now reports two 147.33px tracks and
   two visible images at 960x720.
2. **Hero spanned at tall/narrow galleries and series cards.** Added an
   inline-size container query (`>=470px`) and a
   `.review-gallery-series` exclusion.
3. **1440x900 lost the primary-image emphasis.** Added a 900-999px height band
   where the first image spans two columns with a 160px preview cap; all four
   images remain fully visible.
4. **Reduced-motion rule was overridden by cascade order.** Moved it into a
   component-local rule after the focused prompt style; the suite asserts a
   computed duration <= 0.001s.
5. **Overlay tools did not fit the real 960px minimum.** Kept 24px buttons and
   changed insets/gaps; added badge/tool separation and missing-card control
   assertions.

## Known Tradeoffs

- 1366x900 and 1600x900 show two of four images fully; the rest scroll. These
  are not acceptance viewports.
- 1280x1024 series shows two of three cards fully; the third scrolls.
- The 1440x900 hero preview is capped at 160px and crops more than the 260px
  tall-viewport hero; the preview dialog remains full size.

## Not Fixed

- `src/app/review/page.tsx:1566-1567` video tile aria-labels are pre-existing
  mojibake in HEAD. Out of scope; they only affect screen-reader labels.
