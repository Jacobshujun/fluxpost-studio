# Repair review HEIC and TOS delivery

## Goal

Make review-desk images browser-readable and fast by converting HEIC source media before persistence, serving managed TOS objects without VPS body proxying, and safely repairing historical generated posts.

## Requirements

- Decode real HEIC bytes with `heic-convert@2.1.0`, encode JPEG at quality `0.9`, validate the output, and replace staged files atomically.
- Share HEIC normalization between crawl media caching and direct keep-mode image generation.
- Never persist an unsupported remote HEIC URL as a successful final generated image.
- Load native Volcengine TOS public objects directly and redirect configured managed TOS URLs from the proxy; retain proxying for source CDNs that need request headers.
- Reject upstream HEIC responses at the browser media proxy boundary.
- Add an admin-only, cursor-paginated scan/apply API and config UI control for exact-match historical repairs.
- Preserve image order, body text, review status, owner scope, and the existing database schema.
- Repair only exact source-image matches whose replacement passed image validation and TOS verification; report all unresolved entries without changing them.

## Acceptance Criteria

- [ ] A real HEIC fixture saved with a `.jpg` suffix converts to a valid JPEG.
- [ ] A source with one JPEG and eight HEIC images caches all nine as managed browser-readable media when TOS is enabled.
- [ ] Keep-mode generation returns durable browser-readable URLs and marks failed unsupported images for review instead of saving broken URLs.
- [ ] Native Volcengine TOS previews bypass `/api/media/proxy`; custom managed TOS URLs receive a cacheable redirect; source CDN images retain proxy behavior.
- [ ] The repair scan performs no external writes and apply mode is admin-only, paginated, exact-match, idempotent, and auditable.
- [ ] The known production post has nine `200 image/jpeg` images with non-zero natural dimensions after repair.
- [ ] Focused checks and the full Trellis baseline pass before deployment.

## Notes

- Production repair may read public source media and write verified TOS objects, but must not call TikHub, text/image models, Feishu, or other paid providers.
- Back up affected `generated_posts` rows before applying production repairs.
