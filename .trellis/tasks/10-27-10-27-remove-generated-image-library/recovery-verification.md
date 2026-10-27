# Recovery Verification

Date: 2026-10-27. User approved backup, repair, testing, commit and local LAN
activation. No remote push/deployment or further index cleanup is authorized.

## Protected Data

- Full current PostgreSQL custom-format dump: ignored local
  `data/backups/library-recovery-20261027/runtime.dump`, 785,133,742 bytes.
- Dump and 11 library-table inventories use the same exported database snapshot.
  SHA-256 receipt and inventories are adjacent ignored files; do not commit them.
- `pg_restore --file=NUL` decoded the complete archive successfully. Directory
  ACL is restricted to the current Windows account and SYSTEM. This is not a
  pre-deletion backup and cannot undo the earlier generated-index cleanup.
- A full restore drill into another database was not performed: the application
  role lacks CREATE DATABASE permission. No production permission was changed.
- Authenticated checks use one short-lived temporary session for an existing
  active administrator, removed in `finally`. No credentials are printed or
  persisted. Browser requests are GET-only; mutations are blocked by the test.

## Repair And Release Safety

- Existing removal diff reviewed: generic generation/media persistence remains;
  capture/index/backfill and generated-specific UI/schema/routes are retired.
- Gallery distinguishes list/navigation errors from successful empty results,
  waits for initial navigation and offers explicit manual retry. No polling,
  silent fallback or automatic regeneration is introduced.
- Local launcher now requires a matching on-disk SHA manifest before using
  legacy `.next` as rollback. A process SHA cannot identify files rebuilt after
  startup. On inspection, the candidate-state file named an absent managed slot;
  the newly rebuilt `.next` was NOT a valid old-code rollback.
- Missing/mismatched/matched manifest cases execute the real PowerShell guard
  with mocked read operations. Red test failed before the guard, then passed.
- No compatible prior managed slot is available for the first recovery launch.
  If activation fails, stop and repair the verified candidate; do not restart
  the old generated-index-dependent code or recreate its tables. Later recovery
  candidates may roll back only to a verified schema-compatible build.

## Verification Before Activation

- New error-state browser check fails against the pre-fix build and passes the
  final build at 1440/390 in all three themes. Covers independent list/navigation
  failures, unsuccessful/successful retries, delayed navigation, no mutation and
  no false empty state. Command:
  `python .trellis/verification/library_load_error_browser_check.py`.
- SQLite unified-library check asserts generated tables are absent and verifies
  ordinary navigation/detail/tags alongside collection, favorite, permission,
  paging and Canvas snapshot migration coverage.
- Opt-in PostgreSQL test uses only TEMP tables and `search_path=pg_temp`, bypasses
  runtime initialization, and verifies ordinary list/navigation/detail/collection/
  tags/favorites and owner isolation without generated tables. Command:
  `node --env-file=.env.local node_modules/tsx/dist/cli.mjs .trellis/verification/library_retirement_postgres_check.ts`.
- Existing gallery browser and Canvas/library color browser checks pass all six
  theme/size combinations each, including V1/V2 selection. No provider calls.
- Source lint passes with zero errors and 16 existing warnings; TypeScript,
  production build, built configuration synchronization, isolated HTTP smoke
  and SQLite store checks pass.
- Full baseline passes pre-lint checks and stops at the same 17 ignored local
  import-script lint errors. No gate is weakened. Initial context-budget failure
  was resolved by shortening status.md, not altering the budget.
- Worker-disabled loopback smoke against real local data passes authenticated
  navigation/list/detail/tags/favorites and all 24 direct collection reads.
  Real browser at 1440/390 shows 60 first-page assets, loads the first thumbnail
  and original, and has no page errors or mutation requests.
- All 11 library-table row counts AND content digests remain identical to the
  backup snapshot after real-data tests; generated tables remain absent.
- Preflight: no live Canvas queue leases, runnable queued items, provider-task
  resumes or iteration recovery candidates; no schedule child admissions,
  retry candidates or missing aggregation runs were identified. Historical
  running states exist and are not rewritten or replayed as part of recovery.

Local logs/receipts: ignored `test-artifacts/library-recovery-*` files. They are
not Trellis context and must not be committed. Port-3001 activation evidence
will be recorded after the clean-HEAD release.
