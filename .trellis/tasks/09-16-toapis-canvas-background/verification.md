# Verification

Date: 2026-09-16.

- Passed focused ToAPIs adapter, outgoing background requests, exact-pixel/byte-preservation, Canvas per-image background/fingerprint and content-collection checks.
- Complete `node .trellis/verification/check.mjs` baseline passed with `TRELLIS_SMOKE_PORT=45678`, exit 0. Includes lint, TypeScript, production build, HTTP smoke and SQLite checks. Log: ignored `.tmp-toapis-background-baseline.log`.
- `python .trellis/verification/simple_image_dimensions_browser_check.py` passed with BROWSER_BASE_URL=http://127.0.0.1:45678: simple settings and both Canvas image nodes at 1440px and 390px. Checks transparent selection, PNG change/JPEG disabling, 3:4 at 4K, save/reload, legacy default and no horizontal overflow. APIs intercepted; workers disabled.
- Screenshots inspected under ignored `test-artifacts/canvas-image-dimensions-model.gpt-image*-*.png`. An initial mobile viewport assertion needed center scrolling; one subsequent hidden-node initialization timeout was not reproduced by the independent retest or final full browser pass.
- Regression fixtures updated for the new Canvas field/import, preserving existing assertions. The initial baseline context budget overflow was fixed by shortening this task's status entries.
- No paid image calls, external publishing, configuration changes or runtime-data mutations. Official custom-size and real alpha-channel acceptance remain untested; offline fixtures confirm returned transparent PNG bytes are preserved.
- Local /api/version remains candidate 9dba663e29b99fbe9f14837a820cb90f95cc53e6. Read-only preflight found 51 running Canvas runs, 4 running schedules, 32 running/2 queued Canvas queue rows and 1 queued simple run. No 3001 restart was attempted. Activate with the normal clean-HEAD `npm run local` only after active work drains.

Ordinary API docs list 3:4 and 4K support. Official docs instead require pixels, selected quality, n=1, image_urls and optional background=transparent; the application calculates 2480x3312 for its 3:4/4K selector. Upstream validation still decides acceptance of that custom pixel size.
