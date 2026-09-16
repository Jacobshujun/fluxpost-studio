# Verification

- Full offline baseline passed: `TRELLIS_SMOKE_PORT=45678`, `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`. Includes domain checks, lint, TypeScript, production build, built config synchronization, HTTP smoke and SQLite. Existing lint warnings remain.
- `node .trellis/verification/simple_image_dimensions_check.mjs` passed after extending API assertions. Presets/custom model IDs, explicit formats, null reset, PNG/JPEG/compression, invalid input rejection, saved settings, frozen run/resume and all three generation paths are covered.
- `BROWSER_BASE_URL=http://127.0.0.1:45679`, `python .trellis/verification/simple_image_dimensions_browser_check.py` passed at 1440px/390px. Model presets/custom typing, inferred preset format, explicit override, save disabled states, reload, captured launch, default reset, JPEG compression and transparent PNG pass. Canvas ordinary/per-image controls also pass.
- `python .trellis/verification/canvas_gpt_inputs_browser_check.py` passed at both widths against the same worker-disabled smoke server. Shared selector extraction preserves numbered reference inputs and nested Canvas editing.
- Screenshots inspected: ignored `test-artifacts/simple-image-dimensions-{1440,390}.png`; no text collisions or horizontal overflow.
- One output per existing simple image task is preserved. Provider-specific parameter support and output acceptance remain governed by the existing image adapters; no paid provider, TOS, Feishu or publishing calls were made.

## Local Candidate

After verification, commit this task and activate with `npm run local` from the clean primary worktree. Final runtime identity is checked against HEAD through `/api/version`; no remote push/deployment is in scope.
