# Verification

Date: 2026-09-16. Implementation and checks complete; user authorized the local commit. Local activation remains pending.

- Full offline baseline: `TRELLIS_SMOKE_PORT=45678 node .trellis/verification/check.mjs`, exit 0. Includes lint, TypeScript, production build, isolated HTTP smoke and SQLite. Ignored log: `.tmp-canvas-gpt-inputs-baseline.log`.
- Extended existing workflow and image-executor checks cover numeric ordering independent of object/edge insertion, groups, legacy precedence, duplicate URL behavior, max 16 before provider call, snapshot/resume identity, single-edge enforcement, workflow round-trip, sparse expansion, bypass and disabled-source blocking.
- Browser: `BROWSER_BASE_URL=http://127.0.0.1:45678 python .trellis/verification/canvas_gpt_inputs_browser_check.py`, exit 0 at 1440px/390px. Desktop pointer wiring expands inputs immediately; source deletion preserves image_2 and the next empty slot. Both viewports verify inline transparent/PNG, JPEG disabling, 2480x3312 output for 3:4/4K, reload, nested expansion/deletion/persistence and no page overflow or console errors.
- Inspected screenshots: ignored `test-artifacts/canvas-gpt-inputs-1440.png` and `canvas-gpt-inputs-390.png`.
- Regression fixtures now include the shared registry helper and input geometry dependency. Browser harness corrected label matching and checks the native option disabled property, as existing browser checks do.
- No live image generation, publishing, provider configuration edits or runtime mutations. Port 3001 was not restarted; prior task records active runtime work and old candidate identity. Worker-disabled smoke server is stopped after verification.

Use: connect images to image_1, image_2, etc. Each numbered port accepts one edge; an image group retains its own order. Select ratio/resolution/background directly on the node. Official routes receive the displayed computed pixels; configured route selection is unchanged. Legacy uploads and references retain precedence. Arbitrary custom dimensions and per-node model route selection are outside this request's implemented scope.
