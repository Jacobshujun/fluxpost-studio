# Verification

- 2026-09-20: `node .trellis/verification/image_background_check.mjs` passes all five quality values through normalization, JSON generation, multipart edits and ToAPIs legacy requests with and without references.
- `node .trellis/verification/toapis_image_api_check.mjs` passes, including the existing five-level pixels contract and fixed-high ordinary ratio contract.
- `node .trellis/verification/canvas_workflow_draft_persistence_check.mjs` passes all five values through V1 upgrade and isolated SQLite save/reopen.
- `node .trellis/verification/canvas_image_each_check.mjs` passes.
- Full baseline passes with TRELLIS_SMOKE_PORT=45678: domain checks, lint (existing warnings, no errors), TypeScript, build, HTTP smoke and SQLite.
- `python .trellis/verification/canvas_gpt_inputs_browser_check.py` passes at 1440 and 390 pixels against the worker-disabled loopback smoke server. Five options each survive save/reload; existing ordered-input/model/nested-editor checks also pass. APIs are intercepted; no live generation occurs.
- `git diff --check` passes. No paid upstream acceptance or remote deployment performed.
- Local activation follows verification and commit; preserve existing 0.0.0.0 binding with `npm run local:lan` and compare `/api/version` to HEAD.
