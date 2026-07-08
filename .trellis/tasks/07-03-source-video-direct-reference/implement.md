# Source Video Direct Reference Implementation

1. Add deterministic failing check `.trellis/verification/source_video_reference_check.mjs` and baseline entry.
2. Add `GeneratedPost.videoUrls?: string[]` plus `src/lib/source-video-reference.ts` helpers.
3. Add `includeSourceVideo?: boolean` to generation/simple-run contracts and default it off at UI, API, and domain boundaries.
4. Populate `videoUrls` in `generatePost` and demo posts only when `includeSourceVideo === true`.
5. Adjust simple production media eligibility so video-like sources with source videos are selectable even without frames.
6. Preserve and render `videoUrls` in `/api/review`, `src/app/review/page.tsx`, and main workspace save/preview surfaces.
7. Update Feishu publish attachment preparation/upload/state/notification logic to count and upload image plus video files.
8. Run focused checks, `npx --no-install tsc --noEmit`, and the full Trellis baseline.
