# Verification — 2026-09-30

## Passed

- `node .trellis/verification/canvas_local_image_save_check.mjs`: isolated real files, Chinese/space/relative paths, mkdir, original PNG/JPEG bytes and real extensions, eight concurrent writers, existing-file preservation, same-run retry, pending-owned recovery, unclaimed collision rejection, changed/missing outputs, partial retry, permission/disk-full stubs, directory-is-file, disabled environment, checkpoint failure, size/format/count limits and executor legacy/local behavior.
- `canvas_image_download_check.mjs`, `canvas_workflows_check.mjs`, `canvas_scheduler_check.mjs`, `canvas_iteration_runs_check.mjs`, `copy_library_check.mjs`: owner-visible downloads after failed local writes, old workflows, portable config, batch child/aggregate snapshots and node metadata preserved across repeated retry failures.
- `BROWSER_BASE_URL=http://127.0.0.1:45678 python .trellis/verification/canvas_local_image_save_browser_check.py`: all six professional/editorial/creator × 1440/390 cases pass. Intercepted APIs only; no real workflow/file writes. Tests exercise native click/backspace, unchanged node position, autosave, inline/inspector synchronization, refresh, relative folders, clearing the folder, current failure vs historical downloads, completed summary and enabled download button.
- `npx --no-install eslint . --ignore-pattern 'data/**'`: 0 errors, 17 existing warnings.
- `npx --no-install tsc --noEmit`, `npm run build`: pass. Build retains 16 existing dynamic-import warnings.
- `node .trellis/verification/advanced_config_build_check.mjs`, `node .trellis/verification/http_smoke.js http://127.0.0.1:45678`, `node .trellis/verification/db_check.mjs`: pass. Smoke server disabled background workers; database check is read-only.
- `git diff --check`: pass.

## Full baseline blocker

The unchanged command `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` passed context/JSON and every registered deterministic check, including new local-save checks, then stopped at `npm run lint`. There are 17 existing require-import errors in six untracked `data/feishu-copy-import/**/*.cjs` scripts; `git ls-files -- data/feishu-copy-import` is empty. No user data or lint policy was changed. Remaining source lint/type/build/config-smoke/HTTP/SQLite stages were run explicitly and passed. Full lint also reports 18 warnings, including one runtime-data warning; source-only lint reports 17.

Context budgets after adding the contract: startup 36.06 KB / 45 KB; typical code task 69.36 KB / 70 KB before the final concise status wording. September 17 composition status details were preserved under `archive/status-2026-09-30-local-save.md` to keep the context gate intact.

Logs/screenshots are ignored local artifacts under `test-artifacts/canvas-local-save-*`.

## Delivery

User authorized commit and local activation. Existing port 3001 binds 0.0.0.0, so delivery uses `npm run local:lan` after commits/task archival, followed by read-only `/api/version` comparison against full HEAD. No remote push/deploy and no paid/provider/publishing acceptance. Operator acceptance remains pending in the feature state.

## UI regression insight

Keep active inline path controls visible with `:focus-within` when viewport detail becomes overview. Opening the mobile inspector while focusing an inline input covers the field, and animated fitView can interrupt editing. Final implementation isolates gestures without opening the inspector and keeps a focused local input draft; the explicit header click still opens normal inspector editing. Native keyboard assertions target the already-focused input instead of refocusing through automation on each keystroke.
