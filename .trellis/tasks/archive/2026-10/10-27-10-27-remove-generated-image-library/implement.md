# Implementation

- [x] Remove generated-image modules/routes/tests and shared capture calls.
- [x] Restore library and Canvas contracts, rejecting generated-only fields.
- [x] Update deterministic checks and Trellis context/feature state.
- [x] Run focused checks, TypeScript, build and isolated HTTP/SQLite checks.
- [x] Run the temporary local cleanup with dry-run/apply count evidence.
- [x] Verify local cleanup, working-tree scope and port-3001 identity.
- [x] Commit the isolated removal and archive the task.

## Approved Recovery

- [x] Back up the current PostgreSQL database and record library table digests.
- [x] Add explicit gallery load-error state and isolated regression coverage.
- [x] Verify ordinary library/Canvas access without generated tables; baseline,
  source lint, types, build, isolated HTTP and browser checks.
- [x] Check live queues, review the removal diff, commit and activate clean HEAD
  with `npm run local:lan`; never restore generated indexing.
- [x] Verify authenticated ordinary-library reads, media and unchanged inventory;
  record final evidence and archive the task.
