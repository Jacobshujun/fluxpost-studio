# Implementation plan

1. Review planning scope; load frontend and cross-layer guidelines before edits.
2. Add failing regressions using existing isolated TypeScript/provider test
   harnesses for rewriting and original prompts with 24,197 material URLs.
3. Remove URL inventories from both text paths; preserve original inputs and
   downstream image semantics. Verify historical snapshot-shaped inputs.
4. Remove automatic ordinary-mode material submission, guard missing-root
   loading, and clarify UI counts. Preserve explicit viral selections.
5. Update simple_config_sync_check.mjs contract and add focused checks to
   check.mjs. Add mocked browser submission/root/selection regressions using
   existing browser harnesses; never use active 3001 for uncommitted behavior.
6. Run focused checks, changed-file ESLint, npx --no-install tsc --noEmit,
   npm run build, and the documented baseline:
   TRELLIS_SMOKE_PORT=45678 with powershell -ExecutionPolicy Bypass -File
   .trellis/verification/check.ps1. Record the existing 17-error lint blocker
   without weakening checks; run required later checks separately if blocked.
7. Record evidence in this task and update lightweight status/feature evidence.
   Review the diff for unintended runtime changes. Do not replay history or
   activate LAN without release authorization.

Implementation and isolated checks completed; see verification.md for evidence
and the full baseline outcome. Port 3001 remains unchanged. No new generic picker,
model-limit guessing or storage changes. Commit/activation remain pending.
