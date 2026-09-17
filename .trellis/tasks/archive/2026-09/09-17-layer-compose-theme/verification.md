# Verification — 2026-09-17

- Reproduced on the previous build: creator theme dialog, headings, fields, select
  and close control computed text contrast 1:1 because canvas-panel was undefined
  outside canvas-shell and the dialog used a white fallback.
- Fixed only layer editor surface references to global panel-solid. Output canvas
  and layer colors remain independent of UI theme.
- Full offline baseline passed with TRELLIS_SMOKE_PORT=45680: domain/media tests,
  lint (0 errors, existing warnings), TypeScript, build, HTTP smoke and SQLite.
- Latest build on worker-disabled 45679: professional/editorial/creator each passed
  1440 and 390 px editing/persistence tests. All themes also switched while the
  portal stayed open. Seven text/control surfaces met 4.5:1 contrast; the output
  canvas remained white. Dark-theme screenshot visually inspected.
- Previous baseline startup exceeded the 70 KB context budget. Older library/batch
  status bullets were preserved in archive/status-2026-09-17-library-batches.md and
  replaced with a link; the budget check now passes without weakening its limit.
- Fixtures intercepted all browser APIs. No paid calls, publishing or real user edits.

Local candidate activation follows the verified commit using npm run local.
