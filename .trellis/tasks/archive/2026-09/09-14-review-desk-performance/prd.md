# Review desk performance

User approved the complete implementation plan on 2026-09-14.

- Make manual editing, saving and approval responsive as history grows.
- Preserve ownership, body policy, source usage semantics and selection after approval.
- Show 50-row previous/next pages with server filters and on-demand detail.
- Keep up to 200 checked IDs across pages; select current page; clear on filter changes.
- Use lazy 240px thumbnails and bounded editor previews, originals in the large viewer.
- Preserve later typing and selection against delayed responses; show save failures.
- Measure isolated 1,000/10,000-post fixtures before/after, target warmed manual save P95 <=500ms and input/button response <=100ms.
- Run focused, browser and full offline checks. No candidate activation, external writes or deployment.
