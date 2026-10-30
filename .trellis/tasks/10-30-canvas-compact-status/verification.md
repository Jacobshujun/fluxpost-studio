# Compact Canvas Status Verification

Date: 2026-10-30

## Cause And Repair

The shared resized-node result rule used `flex: 1 1 62px` even for status-only summaries. Pre-fix Chrome measured a 204px status card with a 29px header inside a 560px text node. Shared CSS now defaults status/result wrappers to content sizing, removes the empty minimum height and lone-header divider, and prevents status-header flex compression. Only actual text/image/video preview panels expand; a non-shrinking auto basis preserves long diagnostics plus previous successful previews in small nodes using the existing content scrollbar. Idle hints retain a compact 29px minimum.

No component, execution, graph, database, media or API changes. Canvas zoom is unchanged; shared selectors apply to iteration nodes too.

## Checks

- `canvas_node_status_browser_check.py`: pre-fix failure confirmed the oversized card. Fixed build passes 60 scenarios: ten input/utility/model/publish node/state cases across three themes at 1440/390. Covers complete/running/queued/failed/idle, multiline wait/error details, failure with prior success, real text/image/video preview layout, 240x240 versus 360x560 sizes, actual desktop resize-handle dragging, editor growth, automatic size save and reload. Media are isolated fixtures; the video case verifies layout only, not playback.
- `canvas_text_viewport_browser_check.py`: six three-theme 1440/390 editing/persistence/manual-view regressions pass. All browser APIs are intercepted in memory on worker-disabled loopback 45678; no actual workflow/provider writes. Screenshots reviewed in professional and creator themes.
- `canvas_workflows_check.mjs`: pass, including new shared CSS contracts and prior focus/navigation regression.
- Documented full baseline: context/JSON and all domain checks pass, then the known 17 lint errors in ignored `data/feishu-copy-import/` scripts stop it. No gate or data script changed. One earlier run hit an isolated Gemini HTTP error; focused rerun and the next complete domain pass succeeded, cause unconfirmed.
- `npx --no-install eslint src scripts .trellis/verification/canvas_workflows_check.mjs`: no errors; 16 existing warnings.
- `npm run build`, `npx --no-install tsc --noEmit`, `advanced_config_build_check.mjs`, read-only `db_check.mjs`, isolated `http_smoke.js`: pass.
- `git diff --check`: pass. Context size remains under the existing limits.

## LAN Delivery

`npm run local:lan` activated clean repair commit `4f375dcf6998f4f169d947b482568f8f7ee6c412` in `.next-local-a`. Runtime/receipt/slot SHA agreed, `0.0.0.0:3001` was verified, and loopback plus `http://10.182.144.38:3001` HTTP smoke and `/canvas` returned expected results. No push, remote deployment or data migration.

After the metadata-only finish commits, activate final clean HEAD through the same launcher. Final identity/slot/binding/HTTP receipts are kept in ignored `test-artifacts/canvas-compact-status-final-lan.log`, `test-artifacts/canvas-compact-status-final-identity.log` and `.fluxpost-local-candidate.json`; no code changes follow verification.
