# Xiaopeng rich-text video inserts

## Request
Repair import failures on valid Xiaopeng BBS rich-text video inserts introduced by the previous strict rich-text parser.

## Acceptance
- Recognize the observed string-valued video insert; preserve all video URLs in normalized media and choose the primary video through existing quality ranking.
- Retain paragraphs and images surrounding videos; exclude video cover attributes from image inputs.
- Preserve attachment video collection, deduplication and malformed-node errors.
- Verify pure video, mixed text/image/video, repeated video URLs, and invalid URLs offline, plus the reported public page read-only.
- Run baseline and remaining checks around the known ignored-data lint blocker; commit and activate a clean local candidate when queues are idle.

## Scope
Xiaopeng normalizer, existing import regression script, Trellis evidence. Existing single-primary-video cache behavior remains; no multi-video download feature or automatic paid rerun.
