# Verification — 2026-11-12

- `node .trellis/verification/canvas_content_collection_check.mjs` passes existing 20-link/vision/image/retry contracts plus Feishu single-record dispatch, cached image/video ports, per-number isolation, default/opt-in tagging, video flags, safety filtering, owner-scoped ingest, missing/ambiguous records, workflow roundtrip and frozen batch outputs.
- `node .trellis/verification/feishu_content_import_check.mjs` and `npx --no-install tsc --noEmit` pass.
- Full `.trellis/verification/check.ps1` with `TRELLIS_SMOKE_PORT=45678` reaches `Baseline verification passed.` Includes focused regressions, lint (0 errors/15 existing warnings), types, build, built-config synchronization, HTTP smoke and isolated SQLite.
- `canvas_content_collection_browser_check.py` passes four link/Feishu cases at 1440/390 widths against the worker-disabled 45678 server. Platform switch resets test selection; list edits reset selection; five-port preset, 20-task preflight, scalar drafts and persisted platform/identifier pass. All API requests intercepted; no collection or batch launch.
- Browser harness uses the existing semantic label wrapper for the generic platform select and checks saved parameter names after preflight persistence.
- Browser screenshots/logs remain ignored under `test-artifacts/` and `.tmp-canvas-feishu-*.log`.
- No real Feishu import/write, paid model request, production service change or user-data mutation was used for verification.
- Activation follows the final clean commit through `npm run local:lan`; ignored activation log and `/api/version` supply runtime identity/HTTP evidence. Live Feishu attachment acceptance remains an operator check.
