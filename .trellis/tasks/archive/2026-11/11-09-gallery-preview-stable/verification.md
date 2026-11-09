# Verification — 2026-11-09

## Repair

Viewer keeps one native dialog open. The asset editor remains keyed inside it to reset drafts and transforms, while details-panel visibility and shell focus persist. Requested detail and original decoding run separately from the displayed asset; target-dependent writes are disabled during a transition. Errors preserve the current image with explicit retry/cancel. Close/history cancellation aborts stale work.

The decoded HTMLImageElement is attached directly to a React-owned empty surface and removed by its layout-effect cleanup. The first implementation decoded one element but rendered a second `<img>`: the frame probe caught one empty mobile frame. Reusing the decoded element eliminated this failure. Stage measurement before paint prevents a temporary incorrect fit. Loading presentation is compact and does not change layout.

## Checks

- Full baseline: `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` passed deterministic contracts, ESLint (0 errors / 15 existing warnings), TypeScript, production build, built configuration sync, isolated HTTP smoke and SQLite check. Log: `test-artifacts/gallery-preview-baseline.log`.
- `python .trellis/verification/library_preview_browser_check.py`: six professional/editorial/creator × 1440/390 cases. Frame samples require the same open dialog, fixed rectangle and a ready image throughout independently held detail/original responses. Also covers detail/original failures, retry/cancel, initial failure, stale detail and image cancellation, close while pending, saved/discarded/cancelled drafts, save failure, keyboard continuity, actual-size/fit and mobile details state. Log: `test-artifacts/gallery-preview-browser.log`.
- `python .trellis/verification/library_collection_batch_browser_check.py`: six cases pass filters/history, preview/drafts, original-size/wheel/pan, paging, permissions, confirmation, import, smart-folder and containment checks. Initial detail-failure assertions now use the unified retry UI. Log: `test-artifacts/gallery-preview-regression.log`.
- `python .trellis/verification/library_colors_browser_check.py`: six library/Canvas color cases pass. Log: `test-artifacts/gallery-preview-colors.log`.
- Browser tests use intercepted API/media on worker-disabled loopback 45678; no real user data, providers, storage writes or production deployment. Images/screenshots under ignored `test-artifacts/library-preview/` are synthetic.

## Local activation

Observed listener is `0.0.0.0:3001`. After the verified code/task commits, use `npm run local:lan` from the clean primary worktree. Exact running SHA and successful activation evidence belong to `/api/version` and the ignored local candidate receipt. Operator review of real images remains a separate acceptance step.
