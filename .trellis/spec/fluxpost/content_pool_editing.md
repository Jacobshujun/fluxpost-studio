# Content-pool manual editing

## Scope / Trigger

Applies to source text/images in `/content`, their uploads, recrawl merges, cache refresh and Canvas pool snapshots. Generated posts and AI editing are independent.

## Signatures

- `PATCH /api/content/items`: `{ id, manualEdit: true, patch }`; returns `{ item }` without `raw`.
- `POST /api/content/items/images`: multipart `id`, `file`; returns `{ imageUrl, bytes, mimeType }` without attaching the image.
- `NormalizedSourceItem.manualEditedFields?: ("title" | "contentText" | "images")[]` is server-owned JSON metadata, no table migration.

## Contracts

- Manual PATCH accepts editable text/media/metadata fields only; identity, ownership and raw source data remain unchanged. Only changed form fields are submitted. Source text has no finished-post length cap.
- Explicit save commits text and ordered images together. Uploads only stage files. Discard removes draft references, never shared media files. Dirty selection/filter/navigation requires save/discard/cancel; upload/save locks conflicting operations.
- Manual fields survive recrawl; unedited metrics etc. still refresh. Manual images bypass Douyin raw-image repair, including `[]`.
- Image changes clear old downloaded-image references, rebuild image/video/frame media URLs, and remap tags by image identity. Tags moved beyond the nine-image tag panel survive. Replacement drops the old image's tag.
- Manual-image cache paths include the SHA-256 prefix of the ordered URL list, avoiding stale positional cache reuse. A cache result with a stale image list cannot replace the newer source. Manual body text survives transcript backfill.
- Canvas pool snapshots merge partial downloads with the remaining manually ordered remote images. The editor shows all images; videos/frames stay separate.
- File drops are captured across the editor, including text fields; clipboard files bubble from title/body/gallery to one upload handler. Replacement paste stops propagation. Text-only paste stays native; busy imports are consumed without uploading. Gallery image dragging is disabled; reorder uses the explicit handle.
- Content previews use pointer-anchored non-passive wheel zoom (1–5x), captured primary-mouse pan, reset and image-identity remounts. Wheel input does not scroll the modal; release/cancel/lost capture ends pan.

## Validation / Errors

Upload requires a signed-in account and accessible sample: 401 without session, 404 missing/inaccessible, 400 for missing/unsupported/empty/>30 MiB image, 500 storage failure. PATCH rejects malformed text/image lists and an entirely empty sample; save errors leave the local draft intact.

## Cases

Good: reorder 15 images, save, refresh/recrawl/cache and retain order and labels. Base: historical unedited samples retain existing normalization. Bad: delete all images then restore them from `raw` or `downloadedImages`.

## Tests Required

`content_pool_editor_check.mjs` uses isolated SQLite/accounts, route calls, local upload files and loopback image responses. It covers identity, raw, recrawl, long text, full snapshots, labels, empty lists, upload auth/errors and cache bytes. It is in the baseline.

`content_pool_editor_browser_check.py` intercepts APIs/media on a worker-disabled loopback test server, rejects 3001, and covers three themes at 1440/390, real gallery drag, keyboard image/text paste, native Chromium file drop over the body, replacement without duplicate append, zoom anchoring/clamps/reset/navigation, captured pan, save/reload, failures, busy/switch guards, filters and pagination. Existing content-library and review browser suites remain regressions.

## Wrong / Correct

Wrong: retain cached `image-1` after moving source image 2 to position 1. Correct: clear source cache references at save and cache into the ordered-list revision directory.
