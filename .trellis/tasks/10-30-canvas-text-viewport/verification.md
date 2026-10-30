# Canvas Text Viewport Verification

Date: 2026-10-30

## Cause And Repair

`CanvasNodeTextEditor` calls `onFocus` on focus and click. The outer interaction mapped that callback to `focusCanvasNode`, which selected the node and animated `fitView`. Inline text split/concatenate controls shared the same callback. Selection now uses `selectCanvasNode`; explicit workbook node-location commands retain `focusCanvasNode` and `fitView`. Initial framing, iteration framing, storage and execution are unchanged.

## Evidence

- Added execution regression to `canvas_workflows_check.mjs`: actual editor callback failed before repair with `1 !== 0` navigation calls; after repair, repeated focus and node switching select correctly with zero navigation calls. Explicit location still calls `fitView` once.
- `node .trellis/verification/canvas_workflows_check.mjs`: pass.
- Full documented baseline (`TRELLIS_SMOKE_PORT=45678`, `check.ps1`): context/JSON and all domain checks passed, then stopped at the previously documented 17 lint errors in ignored `data/feishu-copy-import/` scripts. No gate or unrelated data script changed.
- `npx --no-install eslint src scripts .trellis/verification/canvas_workflows_check.mjs`: no errors; 16 existing warnings.
- `npm run build`, `npx --no-install tsc --noEmit`, `advanced_config_build_check.mjs`, read-only `db_check.mjs`: pass.
- `canvas_text_viewport_browser_check.py`: six cases pass, three themes at 1440/390. Actual clicks, programmatic focus, Enter, typing, cursor movement, clipboard paste, editor switching and transient transform observation preserve the viewport. Selection/inspector, emoji/multiline save and reload, and manual zoom/pan/fit pass. Mobile test stays above the existing overview threshold, which intentionally hides unselected editors.
- `canvas_inspector_browser_check.py`: all nine three-theme 1440/1000/390 cases pass.
- `http_smoke.js http://127.0.0.1:45678`: pass on the isolated worker-disabled production build. Browser APIs were fully intercepted with in-memory fixtures; no actual workflow, provider or media writes.
- `git diff --check`: pass.

## Authorized LAN Delivery

User explicitly requested automatic commit and LAN update. Use only `npm run local:lan` from the clean primary worktree; verify exact `/api/version` identity, `.fluxpost-local-candidate.json` and slot marker agreement, `0.0.0.0:3001`, LAN HTTP smoke and `/canvas`. Activation results are recorded after the release command. No push or remote production deployment is authorized.
