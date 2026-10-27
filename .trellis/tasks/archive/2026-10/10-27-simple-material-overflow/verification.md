# Material overflow repair verification

Date: 2026-10-27. Scope authorized by user: stop simple tasks submitting the
entire library as materials. Filename restoration and rollback are out of scope.

## Implementation

- Home no longer derives/submits generic material IDs from every browsable asset.
  Explicit viral selections keep their separate gated payload. UI counts only
  actual selected library inputs, rather than every browsable URL.
- Missing vehicle root clears the local library/selection and surfaces an error;
  no unfiltered asset request is sent. Existing scoped pagination remains.
- Rewrite and original text prompts no longer serialize material inventories.
  Source text, user instructions, selected image tasks and returned post metadata
  are preserved. Old snapshots pass through the same protected prompt paths;
  no stored records are rewritten and no historical job is resumed.
- API explicit selections still resolve using the authenticated actor, and image
  generation remains source-task/explicit-viral-selection based. No schema change.

## Tests

- RED: `node .trellis/verification/simple_material_overflow_check.mjs` failed
  against the original code with the rewrite-inventory assertion.
- GREEN: the same check passes actual Chat/Responses request capture for empty,
  small and 24,197-URL inputs in rewrite/original modes. Request bodies are equal
  regardless of inventory size; source and instruction markers survive, selected
  image task metadata survives, and frozen historical material arrays stay intact.
- The focused check also executes the page loader for missing/existing roots and
  multiple pages, and runs the API with isolated account/selection/queue stubs:
  empty ordinary inputs, ordered viral inputs, explicit generic input and denied
  selection without task creation all pass. This does not replace the existing
  library authorization checks with a claim of live multi-user acceptance.
- Updated existing simple config, compact workspace and viral contracts to reject
  automatic whole-library plumbing rather than require it. New focused runtime
  regression is included in `check.mjs`.
- `python .trellis/verification/simple_material_overflow_browser_check.py` passes
  at 1440 and 390 pixels with/without the vehicle root: no unfiltered fetch,
  ordinary POST without material IDs, visible zero selected count, one explicit
  viral image producing exactly its ID, no page errors or horizontal overflow.
  APIs intercepted; used worker-disabled 127.0.0.1:45678, never candidate 3001.
- Changed-file ESLint, `npx --no-install tsc --noEmit`, `npm run build`, built
  configuration synchronization, HTTP smoke and SQLite baseline check pass.
- `git diff --check` passes. Test server was stopped after checks.
- Full baseline passes context budgets and all pre-lint checks, then stops at the
  existing ignored runtime-script lint gate: 17 errors / 17 warnings. No gate was
  weakened. Types/build/config/HTTP/SQLite were run separately as recorded above.
  Local ignored logs: `.tmp-simple-material-baseline.log` and
  `.tmp-simple-material-build.log`. This is not a full-baseline pass.

## Release boundary

User authorized commit and LAN activation on 2026-10-27 after reviewing the
verification results, including the existing lint blocker. Activate only through
`npm run local:lan` from clean committed HEAD. No push, paid acceptance calls,
storage-copy jobs, historical replay or filename/data restoration is authorized.

Activation builds the inactive slot before replacing port 3001, starts normal
application workers and restores the prior candidate if activation fails. Compare
HEAD, `/api/version`, candidate state and slot manifest; require LAN binding and
HTTP smoke. Post-activation evidence is written only after verification to ignored
`test-artifacts/lan-material-overflow-release.json`. This authorization is not a
claim that activation has already succeeded.
