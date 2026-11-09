# Verification — 2026-11-09

## Changes and cause

Content preview labelled a relative fit multiplier as 100%, used a percentage-height grid image inside an overflow-hidden stage, and could not shrink below that starting size. Review used a separate percentage/grid image implementation. Neither dialog implemented resize. The prior content browser fixture was only 160x180 and did not assert full large-image boundaries.

Both callers now use a measured, absolute pixel-sized image, actual natural-pixel zoom, bounded captured pan, independent controls and eight captured resize handles. Fit follows viewport size; original 100% and manual zoom keep their pixel meaning. Navigation keeps the panel rectangle and remounts image state. Existing review locks/callbacks and native videos are preserved. Content supplemental details scroll separately.

## Passed

- Complete `.trellis/verification/check.ps1` baseline with `TRELLIS_SMOKE_PORT=45678`: domain checks, lint (0 errors, 16 existing warnings), TypeScript, production build, built config synchronization, HTTP smoke and SQLite. Log: `test-artifacts/image-preview-baseline.log`.
- `python .trellis/verification/image_preview_browser_check.py`: 18 cases, content/review × professional/editorial/creator × 1440x900/1280x480/390x844. Uses 800x8000, 8000x400, 1800x2400, 2400x2400 and 80x60 PNGs plus a failed image. Asserts real image dimensions/full fit bounds, percentages, 100%, wheel anchoring, reachable edges, captured release, navigation/reopen resets, eight-direction resize/opposite-edge stability, min/max and browser-shrink bounds, mobile handles and visible tools. Log: `test-artifacts/image-preview-browser.log`.
- Supplemental `review_compatibility`: actual gallery entry, native video controls, upload locks on preview regenerate/delete, unlocked actions and preview deletion. Log: `test-artifacts/image-preview-compatibility.log`.
- Content editor: six theme/viewport cases, imports/paste/drop/replace/reorder/save/reload/errors, true pixel zoom/reset. Log: `test-artifacts/image-preview-editor.log`.
- Content libraries regression passed. Log: `test-artifacts/image-preview-library-regression.log`.
- Review usability: 45 layouts plus drag/autoscroll/series regeneration/save/reload/video/classic-scrollbar cases passed. Log: `test-artifacts/image-preview-review-regression.log`.
- Inspected desktop content and mobile review screenshots in `test-artifacts/image-preview/`; full long-image borders and independent controls visible.

## Limits and activation

Browser checks intercept API/media traffic on worker-disabled loopback 45678. No provider calls, real user edits or production deployment. The former source-text preview check was updated to follow the shared component; real geometry is verified in the browser suite. Local activation follows verified commit with `npm run local:lan`, preserving observed 0.0.0.0:3001. Running identity is `/api/version` and the ignored local activation receipt; real operator acceptance remains pending.
