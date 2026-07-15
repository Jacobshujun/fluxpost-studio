# Fix Xiaohongshu App V2 source-link import

## Goal

Restore Xiaohongshu source-link tasks after TikHub removed the Web detail APIs, while making provider business failures visible instead of normalizing them as empty successful results.

## Requirements

- Xiaohongshu source-link import must use the current App V2 image and video detail endpoints.
- Xiaohongshu keyword-search detail enrichment must not call removed Web or Web V3 endpoints.
- Direct note IDs and copied share text/short links must be supported by the App V2 request builders.
- HTTP 2xx responses that report a TikHub business failure must throw a useful redacted error at the provider boundary.
- Default verification must remain deterministic and must not call live TikHub or expose credentials or source content.
- Existing Douyin, Weibo, and WeChat Channels source-link behavior must remain unchanged.

## Acceptance Criteria

- [x] No active source code or verification expectation references Xiaohongshu `web/get_note_info_v4`, `web/extract_share_info`, or `web_v3/fetch_note_detail`.
- [x] Source-link image and video detail paths use `/api/v1/xiaohongshu/app_v2/get_image_note_detail` and `/api/v1/xiaohongshu/app_v2/get_video_note_detail` with `note_id` or `share_text`.
- [x] Image and video App V2 fixtures normalize to usable source items.
- [x] HTTP-200 payloads such as `data.ok=false` and failing business status/code values are rejected with endpoint context.
- [x] Focused checks, type-check, lint, build, and the Trellis baseline pass without live provider calls.

## Notes

- Root cause categories: change propagation failure, cross-layer provider contract mismatch, and regression coverage gap.
- Live TikHub diagnostic calls are intentionally excluded unless the user separately approves paid requests.
