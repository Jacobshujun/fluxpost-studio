# Verification

- Full `check.ps1` baseline passed after final source changes: lint, TypeScript,
  production build, deterministic domain checks, isolated HTTP and SQLite checks.
- `python .trellis/verification/canvas_inspector_browser_check.py` passed for
  professional/editorial/creator themes at 1440, 1000 and 390 pixels on a
  worker-disabled loopback server at port 45678. All API traffic was mocked.
- Checked initial hiding, selection, reopen, switching, property edit retention,
  pane dismissal, close dismissal, desktop width recovery with either palette
  state, mobile overlay width, document overflow and browser errors.
- A browser failure exposed an unstable React Flow selection callback replaying
  selection during dismissal. Memoizing it and clearing controlled selection
  fixed the failure; empty selection notifications still preserve native editors.
- Local candidate delivery uses the clean committed HEAD and existing LAN bind
  through `npm run local:lan`. No remote deployment or paid provider calls.
