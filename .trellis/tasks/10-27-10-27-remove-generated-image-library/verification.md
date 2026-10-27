# Verification

## Code Removal

- TypeScript noEmit passed after rebuilding clean Next outputs.
- Production build passed after the final scheduler-validation changes;
  `/api/library/generated` is absent from the route manifest.
- Changed-source lint has no new errors. The full lint result remains the known
  17 errors in ignored local `data/` import scripts and 17 existing warnings.
- Focused Canvas workflow, scheduler, library UI, library performance, unified
  library, library colors, thumbnail, asset and collection checks passed.
- Isolated HTTP smoke passed on 127.0.0.1:45678 with workers disabled. The
  retired generated endpoint returned 404; existing auth/status contracts passed.
- Full baseline passed every pre-lint step and stopped at the unchanged lint
  blocker. Log: ignored `test-artifacts/remove-generated-image-library-baseline.log`.
- Final rerun after the last scheduler-validation changes passed Canvas workflow,
  Canvas scheduler, Canvas UI/TypeScript and production build checks.

## Retired Contract

- Canvas workflow parsing rejects `library-filter` objects containing retired
  generated-image keys.
- Schedule save/load/launch boundaries reject retired filters, including V1
  asset filters.
- Library URL parsing ignores retired query keys and smart-folder operators no
  longer expose generated-only fields.

## Local Data Cleanup

Dry-run and apply both targeted loopback PostgreSQL database
`fluxpost_studio` only.

| Item | Before | After |
| --- | ---: | ---: |
| generated_image_results | 22,607 | table dropped |
| generated_image_sources | 30,331 | table dropped |
| generated_image_scans | 4 | table dropped |
| joined generated assets | 22,255 | 0 |
| library_assets | 24,556 | 2,301 |
| library_asset_labels | 20,716 | 5,302 |
| library_asset_favorites | 1 | 1 |
| library_collection_assets | 2,230 | 2,230 |
| library_smart_folders | 7 | 7 |

- Orphaned labels, favorites and collection memberships remained zero.
- Generated-image outbox files: 0.
- No smart folder contained a retired generated-only condition.
- The one-time cleanup script is removed after apply.
- Original media, generated posts, Canvas runs, ordinary assets and OSS/TOS
  objects were not modified.

## Runtime Boundary

- Port 3001 remained on candidate SHA
  `72dca31a9a4e237c5bf0e7a82cd98fcc21a5c2db` throughout.
- No push, deployment or local candidate activation occurred.

## Follow-up: Ordinary Library Incident (2026-10-27)

- Read-only PostgreSQL audit confirms 2,301 active ordinary assets, 24 nonempty
  collections, 2,230 memberships, 5,302 labels, one favorite and seven smart
  folders. Membership/label orphan counts are zero. No remaining asset has
  generated identity/object-key/metadata markers.
- `/api/version` still returns the pre-removal SHA above. Its ordinary-library
  query fails with `42P01` against the cleaned database. Its navigation route
  also depends on dropped scan tables. Keeping that process running did NOT
  preserve ordinary-library availability; prior runtime acceptance was incomplete.
- Earlier aggregate cleanup evidence does not establish per-record historical
  equality or original-media integrity. The ordinary assets are not all deleted,
  but authenticated browser/media and historical-ID comparison remain pending.
- Full baseline rerun passed the pre-lint checks, then failed at the existing
  17 ignored `data/feishu-copy-import/` script lint errors (17 warnings).
  TypeScript/build/HTTP steps after lint did not run in this invocation. Log:
  ignored `test-artifacts/library-recovery-diagnosis-baseline.log`.
- No recovery, application edits, runtime writes, commit, restart or external
  calls were performed. Plan and limitations: `recovery-plan.md` in this task.
