# Remove historical generated-image library

## Goal

Remove the generated-image indexing, provenance, management and Canvas
integration introduced by `bbe4ff9`, without changing ordinary library,
Canvas asset selection, image generation, generated posts, original media or
OSS/TOS objects.

## Requirements

- Remove generated-image-only modules, worker startup, outbox capture, dedicated
  media reader, `/api/library/generated`, UI controls, filters, smart-folder
  fields, schedule fields and API response fields.
- Preserve generic image generation and media persistence, workspace ownership,
  ordinary library search/tags/collections/colors/favorites, ordinary Canvas
  library selection and V1/V2 schedules.
- Reject entire Canvas workflows or schedules that contain generated-image-only
  filter fields. Do not silently drop those fields.
- Clean the local PostgreSQL generated-image tables, indexed library rows and
  outbox after implementation. Do not delete original images, generated posts,
  Canvas runs, ordinary library records or OSS/TOS objects. No backup is retained.
- Create one isolated commit and do not restart or replace the port-3001
  candidate. Do not push or deploy.

## Acceptance Criteria

- [x] No active source, route, test or Trellis feature spec references the
  generated-image library feature.
- [x] Ordinary library and Canvas checks pass on isolated SQLite/PostgreSQL data.
- [x] Generated-image-only workflow and schedule inputs are rejected explicitly.
- [x] Local cleanup reports before/after counts and leaves zero generated-image
  index rows, source links, scan rows, tables and outbox files.
- [x] Ordinary library rows, collections, favorites, labels and unrelated
  runtime data remain intact with no orphaned relationships.
- [x] TypeScript, focused checks and production build pass; the full baseline
  is run and the known ignored-script lint blocker is distinguished.
- [x] Port 3001 remains on its existing SHA and no remote operation occurs.

## Notes

- Recovery approval (2026-10-27): user approved the recovery plan, including a
  current-state backup, focused error-state repair, verification, local commit
  and port-3001 activation preserving LAN binding. This supersedes the earlier
  no-backup/no-activation restriction for recovery only. No further cleanup,
  generated-index restoration, remote push or deployment is authorized.

- User approved removal, local index cleanup, no backup, one isolated commit and
  no candidate activation.
- The local PostgreSQL snapshot observed during planning had 22,165 indexed
  generated assets, 30,239 source links and 4 scan rows.
