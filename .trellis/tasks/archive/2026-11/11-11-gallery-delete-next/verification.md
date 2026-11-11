# Verification — 2026-11-11

## Change and cause

Both viewer deletion entry points passed the close callback after successful deletion. They now resolve the next image in the current filtered order, load a cursor page if needed, or select the previous image at the end. Close only when no adjacent image remains. The existing draft guard and permanent-delete confirmation remain in place; failures do not navigate.

Successful ID deletions remove successful IDs from the loaded list and adjust its total while preserving cursor pages. Query deletions still reload. This prevents subsequent deletions from losing their position after the old first-page refresh.

## Evidence

- Documented full baseline passed: `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`. Deterministic contracts, lint (0 errors / 15 existing warnings), TypeScript, production build, built config sync, isolated HTTP smoke and SQLite check. Log: `test-artifacts/gallery-delete-baseline.log`.
- `python .trellis/verification/library_preview_browser_check.py`: all six theme/viewport cases passed, including two deletion sequences per case (loaded and cursor-paginated). Covers button/key entry, cancel without writes, per-item deletion failure and explicit retry, failed cursor preload without deletion, dialog identity during held next-detail response, next-image URL/original, repeated deletion, final previous-image selection and closing an empty library. Existing transition/draft/focus/zoom tests pass. Log: `test-artifacts/gallery-delete-browser.log`.
- `python .trellis/verification/library_collection_batch_browser_check.py`: all six theme/viewport cases passed, including updated successful-delete expectation plus existing filters/history/drafts/paging/permissions/imports/containment. Log: `test-artifacts/gallery-delete-regression.log`.
- `git diff --check` passed.

All browser requests use intercepted fixtures on worker-disabled loopback 45678. No real user images were deleted and no provider or remote publish calls were made. The existing startup context exceeded its budget by eight bytes before this task; compacted current status wording to restore the existing gate without changing limits.

## Local activation

Activate only after verification and commit, from the clean primary worktree with `npm run local:lan`, preserving the observed `0.0.0.0:3001` listener. Running full-SHA identity is available from `/api/version` and the ignored local candidate receipt. Real-image operator acceptance remains pending confirmation.
