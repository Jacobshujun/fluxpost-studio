# Verification — 2026-09-10

## Cause and repair

- Region outputs are dynamic; swapping text-only to images-only leaves the node dimensions unchanged, so React Flow retained the old handle bounds. CanvasFlowNode now invalidates internal geometry when the output port identities change.
- Both React Flow instances registered document-level delete listeners. Opening the iteration editor now disables the outer deletion shortcut; an inner media preview similarly pauses inner deletion.
- Only the page and existing iteration checks change. No provider, schedule, database, user workflow, or local candidate behavior is changed.

## Evidence

- Before the fix, the new real-pointer browser check failed: swapping the region output to images and dragging to an image preview produced zero edges instead of one.
- After the fix, `python .trellis/verification/canvas_iteration_browser_check.py` passed at 1440px (38 mocked requests) and 390px (34). Coverage: same-size output replacement, pointer connection without reload on desktop, protected root Delete/Backspace, connected inner node deletion, editable text, retained outer edge, save/reload, and outer keyboard deletion restored after closing the dialog. Existing retry, shared results, import/export and editor checks also pass. No live API calls.
- `node .trellis/verification/canvas_iteration_contract_check.mjs` passed, including the new handle identity and outer keyboard isolation guards.
- Full baseline passed with TRELLIS_SMOKE_PORT=45678 via `.trellis/verification/check.ps1`: deterministic checks, lint (17 existing warnings, zero errors), TypeScript, production build, HTTP smoke and isolated SQLite. Existing build tracing warnings remain.
- Ignored local logs: `.tmp-iteration-interactions-before.log`, `.tmp-iteration-interactions-final-browser.log`, `.tmp-iteration-interactions-baseline.log`.

## Release boundary

This repair is uncommitted. No commit, port-3001 activation, push, deployment or live provider acceptance was authorized or performed. The isolated port-45678 server disables background workers and is stopped after verification.
