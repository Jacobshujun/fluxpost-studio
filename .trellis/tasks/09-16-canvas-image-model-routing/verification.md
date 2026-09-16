# Verification

## Isolated Evidence

- Request capture: presets and arbitrary case-sensitive custom IDs retain the submitted model. Explicit format wins even for a legacy-looking model. Unknown names never imply legacy.
- Reproduction: gpt-image-2.5-flare-vip, 4K, 4:3 -> POST /v1/images/generations, JSON size=3312x2480, no resolution, n=1, selected quality, optional URL references. HTTP 400 unsupported_size is preserved with model/size; no second request, alternate model or interface. A size refusal wrapped in HTTP 500 is also non-retryable. Accepted failed tasks retain redacted code/message.
- Configured fixture secrets and bearer tokens do not appear in surfaced errors or captured logs. HTML bodies are omitted.
- Real isolated SQLite create/update/reopen retains all three requested presets and a trimmed arbitrary ID, while a second node retains its absent/default model.
- Clipboard copy and V1 upgrade retain model/format; changing one copy does not change the original. Per-image model changes invalidate completed results, while absent legacy config preserves reuse. Standard JSON, SSE multipart, Responses, Canvas numbered references and async resume retain model IDs.
- Mocked Chromium 1440px/390px passes model selection, custom typing across a preset prefix, save/reopen, independent nested nodes, 4K dimensions, transparency, ordered references and nested connections. No page errors or horizontal document overflow. Screenshots: ignored test-artifacts/canvas-gpt-inputs-{1440,390}.png.
- Full baseline: TRELLIS_SMOKE_PORT=45678, powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1 passed (exit 0). Includes all domain checks, lint (0 errors, 17 existing warnings), TypeScript, production build, built config synchronization, HTTP smoke and SQLite. Ignored log: .tmp-image-model-baseline.log. Isolated loaders now include the new dependency; Responses assertions cover model precedence.

## Manual Provider Acceptance

No paid generation, upload, provider probe, TOS write or publishing was called. Read-only public docs were fetched on 2026-09-16. VIP uses pixels and supports URL references in generations; exact size limits are upstream-defined. The gpt-image-2.5-official preset is retained verbatim as requested, although docs call it a series name and require complete flare/sunburst IDs. Availability, output dimensions, alpha and billing remain pending manual acceptance.

## Local Release

Implementation commit 027bec0e62b4b072d6973cfc3ec03dd51cf04157 activated successfully with npm run local from a clean primary worktree; port 3001 HTTP smoke and /api/version agree. Final documentation/archive HEAD is reactivated after this record so runtime remains equal to clean HEAD. The ignored .fluxpost-local-candidate.json and GET /api/version retain authoritative final full-SHA evidence. No remote push or production deployment is included.
