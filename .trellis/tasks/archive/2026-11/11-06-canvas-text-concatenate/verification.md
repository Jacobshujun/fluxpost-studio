# Verification — 2026-11-06

- `node .trellis/verification/canvas_workflows_check.mjs`: pass. Covers initial/spare/capped input visibility, sparse legacy inputs, 16-port graph validation and clipboard roundtrip, reverse-insertion executor ordering, empty filtering and trimming.
- `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`: pass. Includes offline contracts, lint (0 errors / 16 existing warnings), TypeScript, production build, HTTP smoke and SQLite checks. Gemini executor fixture now injects the real registry dependency.
- `python .trellis/verification/canvas_text_concatenate_browser_check.py`: all six professional/editorial/creator × 1440/390 cases pass on isolated worker-disabled loopback 45678. Desktop checks drag five connections, observe the next handle and reload saved edges/config. All widths check legacy fourth input, full 16 inputs, sparse inputs and collapse to one empty input. API traffic intercepted; no external requests or page errors.
- `git diff --check`: pass.

## Contract

`utility.text-concatenate@1` keeps saved A-D IDs and config semantics, extends handles through P, displays numbered labels, and reuses GPT-style visibility. Execution always follows the shared port order. No database migration or provider requests.

## Local activation

After the verified commit and task archive, activate clean HEAD with `npm run local:lan`, preserving the existing 0.0.0.0 binding. The ignored local activation receipt and `/api/version` record the exact active SHA. Operator acceptance remains pending.
