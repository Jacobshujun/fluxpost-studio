# Verification

- Full offline baseline passed 2026-09-15 using TRELLIS_SMOKE_PORT=45678:
  contracts, lint (0 errors, 17 existing warnings), TypeScript, build, isolated
  HTTP smoke and SQLite checks.
- `python .trellis/verification/canvas_content_collection_browser_check.py`
  passed at 1440px and 390px against the worker-disabled port-45678 build.
  All APIs were intercepted; no schedules or external providers were launched.
- Keyboard checks cover trailing Enter, repeated Enter, leading/middle Enter,
  spaces, Chinese insertion, caret continuation and fixed/manual mode reset.
  Twenty entries separated by blank lines still save/preflight as twenty tasks.
- The fixture opens the graph on desktop before resizing the scheduler to each
  test width; initial mobile graph measurement left nodes hidden in this fixture.
  This check verifies mobile scheduler editing, not initial mobile graph loading.
- No OS-level Chinese IME candidate-window test was performed.
- Screenshots: test-artifacts/canvas-content-collection-{1440,390}.png (ignored).
- Spec review: captured the raw draft/normalized parameter boundary in frontend
  state-management.md. Feature acceptance state is unchanged.
