# Preserve same-name Feishu attachments

## Goal

Preserve every Feishu attachment when multiple files share a filename. User reproduced eight source images collapsing to one for AI00001.

## Requirements

- Isolate attachments by record and attachment identity; preserve source order and avoid stale files from previous imports.
- Shared importer fix applies to simple mode, Canvas and content-pool import.
- Existing originals and runtime state must not be deleted. Errors cannot become a successful incomplete import.
- Verify actual eight-image record read-only; use mocked CLI/filesystem regressions before local activation.

## Acceptance Criteria

- [x] Same-name eight-image fixture yields eight distinct files/URLs with matching contents and source order.
- [x] Repeated imports and attachment removal cannot include stale files; same number/different record stays isolated.
- [x] Download failure is explicit; importer, Canvas/pool and full baseline pass.
- [x] Actual eight-image attachment download/public-size verification and backed-up repair of two local entries pass. Candidate activation uses clean verified committed HEAD on LAN 3001.

## Notes

- No Feishu table writes, model calls, production deployment or unrelated media cleanup.
