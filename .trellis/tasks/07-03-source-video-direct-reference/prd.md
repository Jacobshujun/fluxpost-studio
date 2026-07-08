# Source Video Direct Reference

## Goal

Source-based video and mixed-media drafts should support carrying the original source video as final review/publish material, while keeping the entry switch default-off so operators opt in before video material is attached.

## Requirements

- Add final generated-post support for source videos through a shared `videoUrls` contract.
- Source-based generation paths must populate `videoUrls` only when `includeSourceVideo === true`, using the best available source video reference, preferring `downloadedVideoUrl` and falling back to `videoUrl`.
- Simple and advanced entry points must expose an operator switch labeled `引用源视频素材`, defaulting off in UI and API/domain normalization.
- Existing video-frame image tasks and image generation behavior must remain intact; video references are added final material, not generated images.
- Simple source production must not skip a video-like source solely because highlight frames are missing when the source has a usable video URL.
- Review APIs and review UI must preserve, display, preview, count, and delete video materials without adding video upload/regeneration in this task.
- Feishu publishing must upload local source videos to the same configured attachment field currently used for generated images.
- Remote-only source videos may be visible in review, but Feishu upload must fail clearly when no local uploadable video file exists.

## Acceptance Criteria

- [x] `GeneratedPost` includes optional `videoUrls`, and source-based generated posts save the field consistently.
- [x] Advanced single generation and simple source runs attach source videos only when the operator enables `引用源视频素材`.
- [x] The source-video switch defaults off in UI state, browser request payloads, API parsing, and domain normalization.
- [x] Simple video-like sources with `videoUrl` or `downloadedVideoUrl` can enter production even when `videoFrames` is empty.
- [x] Review save/edit flows include `videoUrls` in allowed patches and keep the value through manual saves, approvals, and AI edit saves.
- [x] Review desk shows video materials distinctly from image materials and can remove a draft video before save.
- [x] Feishu attachment upload combines `imageUrls` and `videoUrls` for the existing `imageUrls`/`动态素材` field-map key.
- [x] Deterministic verification covers the cross-layer contract and is included in the Trellis baseline.

## Notes

- No generated-video creation, video editing, manual video upload UI, or new Feishu field is included.
