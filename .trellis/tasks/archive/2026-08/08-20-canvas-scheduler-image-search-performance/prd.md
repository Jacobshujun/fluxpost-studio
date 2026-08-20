# Canvas batch image search performance

## Goal

Keep the infinite-canvas V2 batch scheduler responsive while operators search large image libraries, and make picker thumbnails load quickly without changing the original images frozen into schedules or opened in previews.

## Requirements

- The keyword field keeps a local draft. It commits after 350 ms of inactivity or immediately on Enter, so ordinary typing does not update the complete schedule definition or autosave once per key.
- A committed search keeps the previous result grid mounted and non-interactive until the replacement request finishes. Stale requests must never replace newer results.
- The picker requests 24 assets per page, never auto-loads another page, and appends only after an explicit Load more command.
- Select all still consumes every cursor and commits every matching asset id, but it must not append unloaded asset records to the rendered grid.
- Picker tiles use authenticated, fixed-size WebP thumbnails. Full-screen preview, scheduler snapshots, preflight, and launch continue to use the original `LibraryAsset.publicUrl`.
- `GET /api/library/assets/:id/thumbnail` requires a workspace session and asset read permission, accepts only managed TOS library sources, and returns a cached 240x144 WebP response.
- Derived thumbnails live under `data/library-thumbnails/v1`, are keyed by immutable source SHA-256, use atomic writes, deduplicate concurrent generation, and run through a four-slot pool.
- A local prewarm command generates all missing thumbnails with bounded concurrency, skips valid cached files, and reports generated/skipped/failed totals. It is not part of the offline baseline.
- No `LibraryAsset`, Canvas schedule, database schema, provider, or production deployment contract changes.

## Acceptance Criteria

- [ ] Rapid keyword input emits no library or schedule-save request before the 350 ms commit and emits one final-query library request afterward.
- [ ] The old grid remains stable while a replacement search is pending; the final grid contains no more than 24 new items.
- [ ] Loading page two requires an explicit command. Range selection, clear, select all, stale-query protection, and original-image preview still work.
- [ ] Picker image requests target the thumbnail API, while preview sequences retain original public URLs.
- [ ] Thumbnail checks prove dimensions/format, cache hits, concurrent deduplication, bounded generation, atomic cache behavior, permission/source rejection, and explicit failures.
- [ ] The prewarm command can process the current local library without TOS writes and reports exact results.
- [ ] Desktop and 390px mocked browser checks pass without overflow or console errors.
- [ ] Canvas scheduler checks, scoped lint, TypeScript, build, and the complete offline Trellis baseline pass without live providers.

## Out Of Scope

- SQL-native library search, database migrations, TOS image-style configuration, or a production deployment.
- Replacing original URLs in frozen schedules, previews, generated outputs, or provider inputs.
- Adding automatic background prewarm work during application startup.
