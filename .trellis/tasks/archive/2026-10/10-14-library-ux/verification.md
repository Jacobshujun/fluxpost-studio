# Gallery UX verification — 2026-10-14

## Scope and order

Implemented filtering/viewing first, then management, without API/schema migrations. Browser APIs, thumbnails and originals are intercepted; no storage, AI or real asset mutations were used. User acceptance remains pending.

## Passing evidence

- Focused deterministic checks: `library_assets_check.mjs`, `library_ui_check.mjs`, `library_collection_batch_check.mjs`, `unified_library_runtime_check.mjs`, `route_state_check.mjs`. Runtime fixtures use isolated SQLite. UI checks execute filter wire-name, multi-value, descendant-false, real status-enum and Beijing date/range validation contracts.
- `python .trellis/verification/library_collection_batch_browser_check.py` passed professional/editorial/creator at 1440×960 and 390×844 on worker-disabled loopback port 45678. It rejects port 3001 and intercepts every API/image request.
- Browser assertions cover atomic filters/history/reload, debounce, stale list/cursor responses, original-on-view only, independent selection, wheel zoom/pan/reset, bounded cross-page navigation, standalone asset links, inaccessible details, unsaved guards/save failure, shared metadata/collection permissions, query exclusions, partial batch failures, tags, Delete confirmation/cancellation/retry, 25 import receipts/duplicates/failures/explicit retry/queued cancellation/unsupported files, smart controls, collection forms, modal keyboard focus and no horizontal overflow.
- Screenshot review: desktop professional grid and mobile creator viewer; readable titles, contained toolbar/grid, full-screen original preview and accessible navigation.
- `npx --no-install tsc --noEmit`, source ESLint (0 errors, 16 existing/thumbnail warnings), `npm run build`, `advanced_config_build_check.mjs`, isolated `http_smoke.js`, read-only `db_check.mjs` passed. Originals intentionally use existing image transport rather than Next image optimization.

## Unchanged baseline blocker

Ran `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` with `TRELLIS_SMOKE_PORT=45679`. All context/JSON/domain/runtime deterministic checks passed through route-state and SSE checks. Global `npm run lint` then stopped with 17 `@typescript-eslint/no-require-imports` errors in ignored user scripts:

- `data/feishu-copy-import/batch-115-2026-09-21/{fetch,import}.cjs`
- `data/feishu-copy-import/bulk-2026-09-21/{fetch,import,prepare-truncated,verify-final}.cjs`

These predate the task (also recorded by the September 30 feature evidence). No user-data edit or lint suppression was made. All remaining baseline steps were executed separately and passed, as listed above. Logs/screenshots remain ignored local artifacts.

## Delivery gate

Verified implementation commit: `3147e1953ee5deeafdc5172a40b34068069bec69`. `npm run local:lan` built it from the clean primary worktree into `.next-local-b` and activated `0.0.0.0:3001`; `/api/version`, slot/state manifests and candidate HTTP smoke passed with that exact SHA. No push or remote deployment.

After archive/journal commits, repeat `npm run local:lan` and require `/api/version` to match final clean HEAD. The ignored `.fluxpost-local-candidate.json` and active-slot `.fluxpost-commit` record the final runtime receipt; no application code changes are needed for bookkeeping. Real authenticated operator/TOS/AI acceptance remains pending.
