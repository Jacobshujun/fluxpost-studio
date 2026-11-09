# Content image interactions

## Requirements
- The content-pool graphic editor accepts image-file drops throughout the work area and image clipboard paste while editing, including title/body focus.
- Ordinary text paste, existing image replacement/reordering, staged save and busy guards continue to work without duplicate uploads.
- Content-pool image previews support pointer-anchored wheel zoom, mouse drag pan, zoom controls/reset and reset when navigating images.

## Acceptance
- Browser regressions cover actual keyboard clipboard paste, external file drop over text fields, replacement without duplicate insertion, busy guards, text paste and gallery ordering.
- Browser regressions exercise wheel anchoring, captured drag, reset, navigation and close on desktop/mobile and all three themes.
- Deterministic project baseline passes. Commit verified changes before activating the primary-worktree port-3001 candidate.
