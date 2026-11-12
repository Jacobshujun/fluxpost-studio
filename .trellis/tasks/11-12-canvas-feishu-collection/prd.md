# Canvas content collection Feishu number imports

## Goal

Allow the Canvas 内容采集 node to import by 飞书编号 from the existing configured content-import target.

## Requirements

- Add 飞书编号 to the platform selector; accept one identifier per line and single-test selection.
- Reuse configured Feishu import, mapping and attachments; no credentials in graph data.
- Preserve authenticated ownership, safety filtering, opt-in tagging and video settings.
- Preserve five outputs, per-number batches and frozen downstream retries.
- Existing saved link workflows remain valid.

## Acceptance Criteria

- [x] Offline checks: one record, missing/failed/ambiguous records, filtering, tagging, ownership and media.
- [x] Per-number preset expansion, workflow export/import and frozen outputs pass.
- [x] Desktop/mobile browser: platform, test selection/reset, persistence and preflight; no live collection.
- [x] Baseline passes. Local activation uses the verified clean commit on existing LAN 3001.

## Notes

- No new Feishu writes, paid provider calls, external deployment or simple-mode behavior changes.
