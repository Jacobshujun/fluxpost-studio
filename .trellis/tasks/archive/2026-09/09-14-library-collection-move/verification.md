# Verification

- Complete offline baseline passed on 2026-09-14 with `TRELLIS_SMOKE_PORT=45678`: domain checks, lint (0 errors, existing warnings), TypeScript, production build, HTTP smoke, and SQLite store.
- `unified_library_runtime_check.mjs` now exercises moves against isolated SQLite: source/destination permissions, missing destination, identical source/destination, excluded query matches, preserved memberships/media, already-present target, repeated operations, missing asset validation, and absent source membership.
- `library_collection_batch_browser_check.py` passed at 1440x960 and 390x844 against worker-disabled port 45678 with mocked APIs: searchable add/move, read-only/source filtering, disabled empty selection, no search results, failed request retry, cancellation, existing query selections, and viewport bounds.
- Screenshots `fluxpost-library-move-desktop.png` and `fluxpost-library-move-mobile.png` in the OS temporary directory were visually reviewed; dialog text/controls fit without overlap.
- Browser changes do not move real user assets. No provider/storage/Feishu calls or remote deployment occurred.
- Local activation uses the clean committed primary worktree via `npm run local:lan`, preserving the observed `0.0.0.0:3001` binding.
