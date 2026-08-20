# Design: Canvas scheduler image search performance

## Data Flow

1. `ScheduleAssetFilterEditor` owns `searchDraft`; only a 350 ms commit or Enter updates `CanvasScheduleAssetFilter.search`.
2. The committed filter builds the existing authenticated asset-list query with `limit=24`. Request generation and abort checks protect replacement and explicit append operations.
3. A tile renders `/api/library/assets/{id}/thumbnail`; preview state is still built from `asset.publicUrl`.
4. The thumbnail route resolves the signed-in account and readable asset, then delegates to a cache service keyed by `sha256`.
5. The cache service reads `data/library-thumbnails/v1/{sha256}.webp`, or fetches the managed TOS original, validates its bounded payload, uses Sharp to produce 240x144 WebP, and atomically renames a temporary file.

## UI Contract

- Search results are stale-but-visible while loading and selection controls are disabled until the current query succeeds or fails.
- Initial and appended pages contain 24 records. No IntersectionObserver is used for pagination.
- Select all accumulates ids from every cursor but leaves `data.assets` unchanged; a query-local completion marker controls the button label.
- Tiles reserve their final dimensions and expose explicit loading/error visual states. No error path silently swaps in the original image.

## Thumbnail Contract

- Variant: `v1`, 240x144, `fit: cover`, WebP quality 72.
- Source URLs must pass the existing managed-runtime-media URL boundary and source responses must be successful images no larger than the library's 30 MB import ceiling.
- A module-global promise map deduplicates the same SHA and the shared concurrency registry adds a dedicated pool with default/hard cap 4.
- Successful responses use `Content-Type: image/webp`, an immutable SHA-derived ETag, and `Cache-Control: private, max-age=31536000, immutable`.
- Missing/inaccessible assets return 404, missing sessions return 401, and generation/source failures return an explicit 502 JSON response.
- Cache files are derived runtime state: no database row, no schema migration, no Git tracking, and no TOS write.

## Prewarm

- `npm run library:thumbnails:prewarm` loads Next environment configuration before dynamically importing application modules.
- It lists current non-deleted library assets from the active SQLite/PostgreSQL backend, invokes the same cache service, prints generated/skipped/failed and byte totals, and exits non-zero when any asset fails.
- The command is an explicit operator action after code verification and commit; startup and the offline baseline never invoke it.

## Compatibility

- Existing `LibraryAssetPage`, cursor, selection, schedule save/preflight/launch, and preview contracts remain unchanged.
- Existing full-image library pages are unaffected. Only the Canvas scheduler picker uses the new thumbnail endpoint.
