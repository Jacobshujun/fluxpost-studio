# Verification

Date: 2026-11-10 (Asia/Shanghai)

- The new 8K regression initially failed against the old encoder with `Input image exceeds pixel limit`.
- After separating input/output budgets, `node .trellis/verification/canvas_image_process_check.mjs` passed with real-byte 8192 x 5464 and 8192 x 8192 original-size JPEG outputs, 10000 x 8000 to 2160 x 1728 resizing, explicit oversized-output rejection, and rejection of a 10001 x 10000 source before resize.
- Full baseline passed using `TRELLIS_SMOKE_PORT=45678` and `.trellis/verification/check.ps1`, including the complete processing/storage path, source immutability and dimension reporting, lint (zero errors / 15 warnings), types, build, isolated HTTP smoke and SQLite contracts. Ignored evidence: `test-artifacts/high-resolution-image-processing-baseline.log`.
- Encoding remains in the existing single-capacity localImage pool with cancellation and a 120-second child-process deadline. File-size limits, source assets, historical tasks, and provider dispatch are unchanged.
- Read-only activation preflight found no live Canvas queue locks or queue/schedule updates in the previous ten minutes. Stale historical queue rows were left untouched.

Local LAN activation passed through `npm run local:lan` from clean implementation commit `3deac1740175ca5ae53bfd4a2d86ef73b2b35d79`. The launcher HTTP smoke passed, `/api/version` matched that full SHA in candidate mode, and `/` plus `/canvas` returned HTTP 200. Ignored evidence: `test-artifacts/high-resolution-image-processing-activation.log`. Final documentation/archive commits can be activated through the same clean-tree launcher; the ignored candidate receipt and `/api/version` identify the running SHA.

No model/provider replay or historical task mutation occurred.
