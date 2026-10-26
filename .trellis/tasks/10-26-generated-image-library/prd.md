# Historical generated image library and Canvas integration

## Approved scope

User-approved task and implementation, 2026-10-26. Extend the existing library,
not a separate asset system. Cover provable application-generated images from
Canvas, batch/original production and one-click production, local and cloud.

## Requirements

- Backfill only durable generation evidence, including successful saved outputs
  of partial/failed tasks. Never scan external directories or infer generation
  from all post images, prompts, references, upload inputs or conversion caches.
- Bounded durable resumable backfill; show indexed, duplicate, uncertain and failed
  counts. Idempotent retries never call providers; retain all source associations.
- Record owner, entry, task, original URL/name, generation time and explicit vehicle.
  Inherit source ownership, default private; unowned legacy is administrator-only.
- Enroll each new output after successful persistence. Failures are observable and
  retryable using the same deduplication logic as history.
- Reuse original addresses without upload/move. Controlled local/cloud thumbnail
  reads must not enable arbitrary file access. Errors never substitute other images.
- Generated removal preserves originals/tasks and durable exclusion records.
  Existing uploaded-material deletion is unchanged.
- Generated navigation, source filter/badges/details; include results in all images.
  Combine vehicle/unlabelled, original filename, entry/date, collection, tag and
  favorite filters with stable descending generation-time pagination.
- Vehicles come only from structured sources or single/batch manual edits. No AI
  inference or fee. Synchronization never overwrites manual changes.
- Extend LibraryAssetFilters and equivalent smart-folder rules; old rules work.
- Ordinary Canvas and batch selectors share query/smart-folder capabilities.
  Selection/explicit refresh freezes images; subsequent library changes do not
  silently change configured or running workflows.
- Preserve existing three themes, thumbnails and responsive layouts.

## Acceptance and boundaries

Isolated SQLite/PostgreSQL tests cover sources, partial success, local/cloud,
duplicates, links, resume, enrollment retries, exclusions, permissions, manual
overrides, combined filters, paging, smart folders and Canvas snapshots. Mocked
desktop/mobile checks cover three themes and both Canvas selectors. Run existing
deterministic baseline and distinguish old blockers from new failures.

Preserve 25 pre-existing dirty/untracked paths, including OSS migration. No paid
models, production storage writes, Feishu publishing, runtime backfill during tests,
storage migration or remote release. Commit only after verification. Only clean
primary worktree may activate `npm run local`; never bypass guards or use siblings.
