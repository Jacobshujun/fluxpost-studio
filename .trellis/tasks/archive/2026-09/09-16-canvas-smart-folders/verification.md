# Verification

Date: 2026-09-16

## Cause and fix

- `LibraryImageSnapshotPicker` only rendered collections. Added smart-folder options and scoped first/cursor-page queries while preserving idle startup and selected snapshots.
- `normalizeAssetFilter` omitted `smartFolderId` and `includeDescendants`. Autosave adopted the normalized server response and reset the selector; both fields now survive normalization.

## Passing checks

- `node .trellis/verification/canvas_scheduler_check.mjs`: V2 draft save, storage and reload retain smart-folder scope and explicit descendant exclusion; existing scheduler checks pass.
- `node .trellis/verification/canvas_library_performance_check.mjs`: bounded, idle-until-filtered library picker contracts pass.
- Full `check.ps1` baseline passed (exit 0): lint, TypeScript, build, deterministic contracts, HTTP smoke and SQLite.
- `BROWSER_BASE_URL=http://127.0.0.1:45679 python .trellis/verification/canvas_smart_folders_browser_check.py`: intercepted Chromium APIs at 1440px and 390px pass smart-folder options, cursor scope, ordinary collection switching, selected snapshot retention, scheduler autosave/reload and clearing scope, with no page errors or horizontal overflow.
- Port 45678 had a pre-existing development listener. Browser verification therefore used a fresh worker-disabled server on 45679; `node .trellis/verification/http_smoke.js http://127.0.0.1:45679` passed against the new build.
- No real library writes, model requests, publishing or remote deployment were performed by verification.

## Local delivery

Commit verified changes, then activate clean HEAD with `npm run local` and compare `/api/version` to HEAD. Activation result is reported in the session response.
