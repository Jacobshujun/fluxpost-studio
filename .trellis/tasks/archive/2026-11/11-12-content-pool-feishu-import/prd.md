# Content pool Feishu number import entry

## Goal

Add a direct Feishu-number import entry to `/content` using the configured content-import table.

## Requirements

- Keyword, link and Feishu-number tabs; selected mode survives URL reload.
- One identifier per line; explicit project, selected destination collection, video and tagging options.
- Import only: no generation or publishing. Reuse table mapping and attachment downloads.
- Authenticate and check collection ownership before external reads; preserve owner-scoped ingest and safety filtering.
- Show per-number results and accurate partial/empty success counts; refresh content desk.
- Preserve existing Canvas single-item semantics and original link/keyword behavior.

## Acceptance Criteria

- [x] Offline route/service checks cover auth, invalid input, inaccessible collection, partial/not-found/filtering, owner destination/options and raw stripping.
- [x] Existing Canvas Feishu and link regressions pass through the shared service.
- [x] Browser checks cover Feishu entry, payload/destination, result refresh, empty/error/busy handling and mode reload at desktop/mobile widths in three themes.
- [x] Full baseline passes; candidate delivery uses verified clean committed HEAD on LAN 3001.

## Notes

- No live import, paid provider call, remote release, credential change or schema migration during verification.
