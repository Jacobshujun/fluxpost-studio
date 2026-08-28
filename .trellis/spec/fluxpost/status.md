# FluxPost Current Status

Last updated: 2026-08-28

## One-Line Status

The unified image asset pool, collections, smart folders, SQL paging, query selection, thumbnails, and migrated Canvas/simple consumers are implemented and verified; commit/archive and a clean port-3001 candidate remain.

## Current Focus

- Active library types, APIs, URLs, and UI no longer expose `reference | vehicle`; deterministic private migration roots preserve old memberships and Canvas filters.
- Ordinary nested collections, personal favorites, asset notes, flat tags, one-level `all/any` smart folders, permission-aware SQL filters, signed keyset cursors, and server-side query selections share PostgreSQL/SQLite semantics.
- The library grid loads compact 60-item pages and thumbnail endpoints; mocked Chromium passed 1440x960 and 390x844 workflows without horizontal overflow or live services.
- Canvas and simple mode use collection/smart-folder filters and freeze accessible asset snapshots before execution; new imports remain idle until manual AI tagging.
- Focused migration/query checks, TypeScript, lint (0 errors, 20 warnings), build, isolated HTTP/SQLite smoke, and the full baseline pass. An isolated 50,000-asset/1,000,000-label PostgreSQL benchmark met all P95 targets.

## Next Entry

Commit and archive the verified unified-library implementation, then activate clean current HEAD on loopback port `3001` for authenticated operator review and one-time runtime migration.

## Risks And Unknowns

- The real 621-asset runtime database has not been migrated in this dirty-tree verification; the migration was exercised only against isolated fixtures and will run when an approved clean candidate is activated.
- The PostgreSQL collection-subtree benchmark measured P95 `252.6ms` against the `300ms` target and is the closest performance margin as data grows.
- No paid model, TOS write, TikHub, Feishu, Lark, publishing, or production action was exercised.
- Production remains unchanged until a separate deployment is explicitly approved.
- Nine high-severity transitive advisories remain; do not run `npm audit fix --force`.

## History

Detailed task evidence is in `.trellis/tasks/archive/`; older project evidence is under `.trellis/spec/fluxpost/archive/` and the bounded handoff/progress latest blocks.
