# Source Video Direct Reference Design

## Architecture

Add source video references as a generated-post media contract, parallel to existing `imageUrls`. A focused helper in `src/lib/source-video-reference.ts` owns video-like detection and final video URL resolution so generation, simple runs, and future callers do not duplicate `downloadedVideoUrl || videoUrl` logic.

Source-video attachment is controlled by an explicit `includeSourceVideo` option. Entry points default it to `false`; generation resolves and stores `videoUrls` only when the option is `true`.

## Data Flow

`UI switch` -> API parse/default -> `generatePost({ includeSourceVideo })` -> source video helper -> `GeneratedPost.videoUrls` -> generated-post JSON storage -> review APIs/UI -> Feishu publish attachment preparation.

Images remain in `imageUrls` and image tasks remain unchanged. Video references are final materials only.

## Feishu Boundary

The existing field-map key `imageUrls` still names the Feishu attachment field, defaulting to `动态素材`. Attachment upload prepares files from both `imageUrls` and `videoUrls`; record text payload may include video URLs for custom field maps, but default record creation still omits attachment fields before upload.

## Compatibility

`videoUrls` is optional for historical posts. UI and publishing code must treat a missing field as an empty list. Remote video URLs are review-visible but not uploadable through the default Feishu attachment CLI path.
