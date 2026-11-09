# Verification — 2026-11-09

## Implementation and findings

- CanvasImagePreviewDialog now uses shared ImagePreview/ResizablePreviewPanel, preserving actual image dimensions, original links, Escape/backdrop close, arrows and focus restoration. Footer navigation no longer covers image pixels. All existing callers, including inner iteration and scheduler previews, use this dialog.
- Ordinary image input thumbnails and generated-result galleries pass ordered image sequences. Result slot IDs include the index, so repeated URLs do not collapse. Input-node existing URL normalization remains unchanged.
- Real keyboard regression exposed React Flow deleting the selected node behind the preview even though the page shortcut handler already returned early. The outer ReactFlow deleteKeyCode now becomes null while preview is open (inner editor already does this).
- The shared panel's initial visibility:hidden also prevented close-button focus, including after a requestAnimationFrame on some node openings. Replaced hidden initialization with a viewport-constrained centered CSS rectangle; measurement then supplies the interactive coordinates without timing workarounds.

## Verification

- Full project baseline: `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`; final log `test-artifacts/canvas-preview-baseline.log`. Includes domain checks, lint, types, production build, config sync, HTTP smoke and SQLite.
- `python .trellis/verification/image_preview_browser_check.py`: 27 content/review/Canvas × three-theme × desktop/short/mobile cases pass, plus review video/upload-lock/delete compatibility and two ordinary Canvas input-image cases. Log `test-artifacts/canvas-preview-browser.log`.
- Browser assertions cover five actual PNG sizes, true pixel fit/100%/wheel anchoring, bounded captured pan, eight resize handles/opposite-edge geometry/min-max/browser-shrink behavior, visible independent controls, failed image, navigation/reset/reopen, actual dimensions/original link, repeated-result-URL slots, selected input slot and hidden thumbnails, keyboard boundaries, Delete/Backspace isolation, unchanged Canvas viewport, close focus and opener restoration.
- `python .trellis/verification/canvas_image_process_browser_check.py`: 1440/390 pass. Log `test-artifacts/canvas-preview-process.log`.
- `python .trellis/verification/canvas_iteration_browser_check.py`: 1440/390 pass, including inner editing, outer/inner keyboard isolation and graph save/reload. Log `test-artifacts/canvas-preview-iteration.log`.
- Desktop and mobile Canvas screenshots visually inspected under `test-artifacts/image-preview/`.

## Boundaries

Tests use intercepted fixtures on worker-disabled loopback 45678; no real media edits, generation or external publishing. Local activation follows clean committed HEAD using `npm run local:lan`, retaining observed 0.0.0.0:3001. Version/activation receipt identifies the running SHA. No remote release; operator acceptance remains pending.
