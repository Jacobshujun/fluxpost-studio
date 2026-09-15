# Verification

- 2026-09-15 complete offline baseline passed with TRELLIS_SMOKE_PORT=45678:
  deterministic contracts, lint (0 errors, 17 existing warnings), TypeScript,
  production build, isolated HTTP smoke and SQLite checks.
- Parser and scheduler checks passed for standalone delimiters, CRLF, internal
  blank lines/indentation, inline markers, empty blocks, legacy scalar values,
  full fixed text, metadata save and unchanged graph injection.
- Mocked system Chrome passed the prompt separator and content-collection
  browser scripts at 1440px and 390px against the worker-disabled smoke build.
  APIs intercepted; no real workflows/tasks/providers were launched.
- Separator preference and values survived save/preflight and hard reload;
  fixed text, mode switches, trailing Enter and contextual note checks passed.
- Reviewed test-artifacts/canvas-prompt-separator-{1440,390}.png (ignored).
- Source changes confined to scalar editor/layout, helper, metadata persistence
  and preflight validation. Feature acceptance states remain unchanged.
- User may activate via `npm run local:lan` from the clean committed primary
  worktree after running jobs finish. Port 3001 was not restarted in this task.
