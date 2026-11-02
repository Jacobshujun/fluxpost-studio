# Review Image Preview 3:4 Ratio

## Goal

Make the review desk image gallery preview match the 3:4 portrait ratio that most generated images use, instead of showing them in landscape cards that crop the image.

## Background

- User report on 2026-11-02: the content review desk (`/review`) image preview ratio does not match the generated images; most generated images are 3:4.
- Current gallery CSS uses `aspect-ratio: 4 / 3` for every preview and forces the first image into a `16 / 9` hero at tall desktop widths.
- With `object-fit: cover`, a 3:4 image inside a 4:3 or 16:9 card loses a large part of its top and bottom.
- The 960px review thumbnail is a square canvas with the image contained and transparent padding, so a 3:4 card plus `cover` crops the transparent side padding instead of the image.

## Requirements

- R1: Ordinary image preview areas use a 3:4 portrait ratio at every viewport width, including the first image.
- R2: The previous wide first-image hero (`16 / 9`, row span) is removed. The first image stays visually identifiable as primary without changing its ratio.
- R3: Video preview tiles keep their current ratio and behavior.
- R4: The gallery stays compact at desktop widths; the portrait change must not hide most images behind scrolling.
- R5: The click-to-open large preview dialog, thumbnail API, persistence, approval, publishing, filtering, media locking, and image ordering remain unchanged.
- R6: No horizontal overflow at 390px; the three-theme layout suite keeps passing.

## Acceptance Criteria

- [ ] Computed `aspect-ratio` of every image preview (including the primary image) is `3 / 4`; video tiles remain unchanged.
- [ ] At 1440x900 and 1920x1080 all four fixture images are fully visible in the gallery without scrolling; at 1280x720 at least two are fully visible.
- [ ] The first image no longer spans two columns or uses a `16 / 9` preview at any viewport.
- [ ] The three-theme review browser suite passes at all 15 viewports, including the simulated classic scrollbar, series layout, drag and edge-autoscroll cases.
- [ ] The deterministic baseline (`check.ps1`) passes with no new lint or TypeScript errors.
- [ ] No changes to review APIs, saved payloads, approval, publishing, or media ordering.

## Out Of Scope

- Video preview ratio and video output framing.
- Large preview dialog layout and thumbnail navigation.
- Dynamic per-image ratio (tiles stay a consistent 3:4 even for uncommon image ratios).
- Review thumbnail generation and caching.

## Notes

- Decision: use one uniform 3:4 grid instead of keeping a wide first-image hero. A wide hero cannot render 3:4 without becoming taller than the pane, so the first image keeps emphasis through the existing index badge and a subtle accent border.
- Lowering the minimum grid track is allowed if needed to keep four portrait tiles visible at 1440x900.
- Real authenticated visual review remains an operator gate.
