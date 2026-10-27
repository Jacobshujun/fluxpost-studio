# Ordinary Library Visibility Incident

Date: 2026-10-27. Recovery completed; see recovery-verification.md.

## Scope And Evidence

The user reported that ordinary libraries disappeared after generated-library
removal. Investigation used Git/current source, candidate `/api/version`, and
direct loopback PostgreSQL queries inside a REPEATABLE READ, READ ONLY
transaction. No application database initializer or authenticated library GET
was invoked: the old navigation GET starts a backfill and is not read-only.
No application code, runtime rows, media, configuration or listener was changed.

Observed database state:

| Item | Current count |
| --- | ---: |
| Ordinary assets / active assets | 2,301 / 2,301 |
| Collections / nonempty collections | 24 / 24 |
| Collection memberships | 2,230 |
| Asset labels | 5,302 |
| Favorites | 1 |
| Smart folders | 7 |
| Orphaned memberships / labels | 0 / 0 |

All remaining assets have neither generated IDs, generated-index object keys,
nor generated metadata. All have an owner and team visibility. Counts agree
with the previous cleanup receipt for assets, memberships, labels, favorites
and smart folders. This disproves complete ordinary-library deletion; it does
NOT prove every historical record or original binary survived. No pre-cleanup
ID inventory is available in that receipt, and remote media was not fetched.

All three generated-image tables are absent. Port 3001 still reports
`72dca31a9a4e237c5bf0e7a82cd98fcc21a5c2db`, the pre-removal candidate.

## Root Cause

1. Cleanup removed generated tables while retaining the old application.
2. At that SHA, `src/lib/database.ts` includes an unconditional
   `NOT EXISTS (SELECT 1 FROM generated_image_results ...)` in ordinary asset
   queries and tag suggestions. Replaying the ordinary asset predicate in the
   read-only transaction fails with PostgreSQL `42P01`, relation
   `generated_image_results` does not exist.
3. The old navigation route also calls `startGeneratedBackfill`, which inserts
   into the now-absent `generated_image_scans`, before returning collections.
4. The UI initializes navigation/assets empty, reports fetch errors as a
   message, and still renders the empty-gallery state after loading stops.
   A failed query therefore appears as missing collections and pictures.

This is a code/schema deployment-order failure, not evidence of a DELETE of
all ordinary assets. The removal plan's "drop tables" and "keep old candidate"
requirements were incompatible. Isolated tests of NEW code did not validate
the OLD running candidate against the cleaned database. Preserved row counts
and a successful version endpoint were insufficient acceptance criteria.

## Approved Recovery

1. Preserve evidence and take a verified local PostgreSQL backup of the current
   state before any recovery writes. Keep dumps and user data outside tracked
   Trellis files. Retain the existing worktree diff; do not reset unrelated work.
2. Review the pending removal against the ordinary-library contracts. Keep the
   existing 2,301 assets and organizer relations unchanged. Do not import them
   again, recreate generated tables, resume indexing, or restore the old feature.
3. Verify ordinary list/navigation/detail/tags/collections and Canvas asset
   snapshots using isolated fixtures whose schema has NO generated-image
   tables. Include populated ordinary collections and ownership cases. Add a
   UI regression distinguishing request failure from a genuinely empty gallery.
   Expected implementation scope: ordinary library page/error-state test,
   targeted library regression checks, and review of the existing removal diff;
   any additional production changes require evidence and explicit scoping.
4. Run the documented baseline, TypeScript/build and focused checks. Resolve
   or explicitly review the existing lint blocker; do not weaken the gate or
   claim a full pass. Commit only the reviewed recovery/removal scope after
   approval and satisfy the clean-primary-worktree candidate guard.
5. With explicit activation approval, use the documented local launcher and
   preserve the current loopback/LAN binding. Do not push or deploy remotely.
   Check active tasks before replacing the listener. The old candidate is NOT
   a healthy rollback target with the cleaned schema. The prior managed slots
   are absent and the rebuilt legacy output is not an old release. The launcher
   now rejects unstamped/mismatched legacy fallback. On first activation failure,
   stop and repair the tested candidate; do not restore old code or empty tables.
6. Accept recovery on 3001: exact new SHA, authenticated ordinary navigation,
   populated collections, asset detail/original preview, tags/favorites and
   Canvas picker work; database counts/ID inventory match the recovery snapshot;
   generated routes/worker remain retired and no generated tables reappear.

## If Specific Ordinary Images Are Still Missing

Compare named collections/assets against pre-cleanup manifests, import receipts,
or a separately restored backup. Do not overwrite the current database with an
old whole-database dump. Restore only proven missing ordinary records and their
relationships after reviewing ownership and object references.

The removal task records no cleanup backup. Local PostgreSQL `archive_mode` is
`off` (`wal_level=replica`); standard archived-WAL point-in-time recovery is not
established. External backups/snapshots remain pending confirmation. Git can
recover tracked code, not deleted PostgreSQL rows or untracked originals.
Cloud objects/import sources may support reconstruction, but cannot alone
guarantee recovery of original IDs, collections, labels or favorites.

## Verification

Read-only diagnosis, isolated regression checks and authenticated 3001 recovery
acceptance are recorded in recovery-verification.md. All current library tables
match the recovery backup; historical completeness remains unproven. Baseline
retains its existing unrelated lint blocker, with remaining checks run explicitly.
