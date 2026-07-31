# Remove Legacy Local Material Library

## Goal

Retire the legacy local-path material library so FluxPost uses the TOS-backed image library as its active reusable image source.

## Background

- The legacy library persists folder and asset indexes in `material_folders` and `material_assets`; its image bytes remain at Windows-local absolute paths.
- The user approved removing the legacy UI, APIs, domain code, migration entry point, schema/data records, and related verification while preserving the original image files on disk.
- The active TOS-backed image library persists records in `library_assets` and related role, collection, label, and tagging tables.
- The compact home workflow still reads the legacy library for the viral image-imitation material picker. Removing the legacy domain without resolving this consumer would break an active workflow.

## Requirements

- Remove the legacy material-library workspace and navigation from `/content`.
- Remove legacy local folder scanning, CRUD, and local absolute-path preview API routes.
- Remove the legacy-to-new-library migration API and corresponding domain function.
- Remove legacy material-library types, database accessors, bootstrap/import behavior, schema declarations, and SQLite-to-PostgreSQL migration entries.
- Remove legacy verification expectations and replace affected checks with assertions for the intended surviving behavior.
- Change the compact-home viral image-imitation picker to page through the authenticated TOS-backed vehicle library.
- Submit selected vehicle asset ids, validate read access and the `vehicle` role on the server, and freeze the resolved public URLs into the durable simple-run input before enqueueing.
- Use the accessible vehicle-library URLs as the surviving general material references for compact simple runs.
- Delete legacy `material_folders` and `material_assets` database records/tables from the local runtime database only after code verification establishes they are no longer referenced.
- Preserve all original image files at their existing filesystem paths.
- Preserve the TOS-backed vehicle/reference image library, its records, objects, roles, collections, tags, and permissions.

## Acceptance Criteria

- [ ] No active UI or API exposes the legacy local material library, folder scanner, local-path preview, or legacy migration action.
- [ ] Active source and database schemas contain no legacy material-library domain types or persistence tables.
- [ ] Existing TOS-backed vehicle and reference libraries continue to build and pass focused verification.
- [ ] The compact home viral image-imitation picker reads the TOS-backed vehicle library, preserves collection grouping and preview, and submits selected asset ids.
- [ ] The server rejects inaccessible or non-vehicle asset ids and freezes valid TOS URLs before queue execution.
- [ ] Viral dual-reference image generation accepts the frozen remote vehicle-image URLs without requiring a local filesystem path.
- [ ] Local legacy database records/tables are removed without deleting source image files.
- [ ] Project baseline passes, or any unchanged pre-existing blocker is documented with remaining checks run separately.

## Out Of Scope

- Deleting original images from local disks.
- Deleting or rewriting TOS-backed `library_assets` objects or metadata.
- Migrating legacy images into the new vehicle library.
- Mutating the production VPS database or Docker volumes.
