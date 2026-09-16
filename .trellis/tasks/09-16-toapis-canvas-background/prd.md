# Complete Canvas ToAPIs transparent background

## Goal

Support the documented ToAPIs ordinary and Official GPT Image 2.5 contracts, including transparent backgrounds from Canvas.

## Requirements

- Ordinary models retain ratio/resolution, fixed high quality, n=1 and reference_images.
- Official Sunburst/Flare use pixel size, selected quality, n=1, image_urls and optional background=transparent. Do not route them through legacy 4K restrictions.
- Canvas image and per-image reconstruction nodes expose and forward background; omitted legacy settings keep the default background. Background changes invalidate per-image cached results.
- Reject transparent JPEG explicitly; preserve returned image bytes and accepted task resume behavior.
- Remove obsolete generic 4K restriction copy. Do not change credentials, model configuration, or call paid providers.

## Acceptance Criteria

- [x] Ordinary and Official 3:4/4K requests use their documented field shapes, with and without transparent backgrounds and references.
- [x] Canvas controls, execution, validation and retry fingerprints retain background settings.
- [x] Focused checks and full offline baseline pass; desktop/mobile controls checked.

## Notes

- Sources read 2026-09-16: https://docs.toapis.com/docs/cn/api-reference/images/gpt-image-2.5/generation and https://docs.toapis.com/docs/cn/api-reference/images/gpt-image-2.5-official/generation . Official custom-size acceptance remains subject to upstream validation; no live acceptance is claimed.
