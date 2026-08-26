# FluxPost Current Status

Last updated: 2026-08-26

## One-Line Status

Canvas content-pool card selection and V2 batch expansion are implemented, offline-baseline verified, and browser-verified on clean candidate SHA `2b3f94b22e118699f82da595d246b901977ea0dc`.

## Current Focus

- `input.content-pool` now uses an owner-scoped searchable card browser with project/sort controls, advanced filters, compact previews, cursor loading, list refresh, and independent snapshot refresh.
- V2 schedules can bind a main-task `content-pool` parameter only to content-pool inputs, using manual or condition sources with fixed/each/random expansion and compact immutable snapshots.
- Manual missing or unauthorized IDs fail explicitly; full expansion and random freezing enforce the 200-item boundary while the existing 2,000-child ceiling remains unchanged.
- Preflight and launch never update content-pool status or publish; launch uses frozen snapshot fields even if mutable source rows later change or disappear.

## Next Entry

Review the clean local candidate on port `3001`; production deployment remains a separate approval and exact-SHA operation.

## Risks And Unknowns

- Real authenticated multi-user PostgreSQL use of content-pool schedule preflight remains an operator-review gate; default verification used owner-scoped domain fixtures and browser mocks without mutating runtime content.
- No paid model, TikHub, Feishu, Lark, publishing, or production content-pool action was exercised.
- Production remains unchanged until a separate deployment is explicitly approved.
- Nine high-severity transitive advisories remain; do not run `npm audit fix --force`.

## History

Detailed task evidence is in `.trellis/tasks/archive/`; older project evidence is under `.trellis/spec/fluxpost/archive/` and the bounded handoff/progress latest blocks.
