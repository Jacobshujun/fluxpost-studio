# Design

## Removal Boundary

`bbe4ff9` is the feature boundary. Reverse only its generated-image-specific
hunks against current HEAD; later OSS changes in shared files must remain.

Delete the dedicated result index, evidence adapters, capture context, backfill
worker, local generated-media reader, filters, controls, generated API and
migration/checks. Remove capture calls from image generation, Canvas executors,
simple runs, original batches, generated-post persistence, library queries,
thumbnails, color analysis and tagging.

## Preserved Contracts

Keep generic provider output persistence, owner propagation unrelated to the
index, library uploads, searches, labels, collections, favorites, colors, smart
folders, thumbnails, ordinary Canvas pickers and scheduler behavior. Keep
`public/generated`, generated posts, runs, tasks and OSS/TOS media unchanged.

Generated-only fields are invalid:

- `generated`, `generationEntry`, `generatedFrom`, `generatedBefore`,
  `unlabelledVehicle` and generated `filename` filters.
- Generated smart-folder fields and Canvas schedule asset-filter fields.

Canvas graph decoding and stored schedule normalization must throw a clear error
when these fields are present. No silent stripping or fallback.

## Local Data Cleanup

Use a temporary default-dry-run script. On `--apply`, run one PostgreSQL
transaction:

1. Select generated library assets by joining `library_assets` to
   `generated_image_results`.
2. Delete those library assets; cascades remove labels/favorites/memberships.
3. Remove generated-only smart-folder conditions; delete folders left without
   conditions.
4. Drop `generated_image_sources`, `generated_image_results` and
   `generated_image_scans`.
5. Delete the local outbox after the transaction.

The script validates counts before and after and is removed after execution.
SQLite may have no such tables; cleanup handles both backends without inventing
state.

## Rollback And Operations

The original no-activation removal left old queries incompatible with the
cleaned schema. Recovery approved on 2026-10-27 follows `recovery-plan.md`:
back up current state, verify removal against a schema without generated tables,
commit reviewed changes, then activate on the existing LAN port 3001.
Do not roll back to generated-table-dependent code without a separately designed
database-compatible recovery. No further runtime cleanup is part of recovery.

The gallery tracks list and navigation failures independently from empty data.
Failure renders an explicit alert with manual read-only retry; only successful
list and navigation responses can establish an empty-library state. Stale list
requests must not overwrite newer error state. No automatic retries are added.
