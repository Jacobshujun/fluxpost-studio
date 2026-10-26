# FluxPost Current Status

Last updated: 2026-10-26

## One-Line Status

Qwen T2I/I2I node verified locally; OSS read-only inventory is ready with no copy or switch. Activation and production gates remain.

## Current Focus

- Qwen T2I/I2I committed as `0b775c7`; activation pending: `.trellis/tasks/10-26-canvas-qwen-image/verification.md`.
- Iteration references and `OPENAI_TEXT_REASONING_EFFORT` are verified; evidence: `.trellis/tasks/archive/2026-10/10-21-iteration-reference-inputs/verification.md` and `.trellis/tasks/10-21-text-reasoning-effort/verification.md`.
- Local API tools installed: `.trellis/tasks/archive/2026-10/10-21-local-api-panels/`.
- Canvas placement: pointer/viewport conversion and first-node view stability verified; evidence: `.trellis/tasks/archive/2026-10/10-20-canvas-node-placement/`.
- Gemini: native text/images, independent config/proxy, cancellation and offline/browser/build/HTTP/SQLite pass; live acceptance paused. Evidence: `.trellis/tasks/archive/2026-10/10-19-canvas-gemini-node/verification.md`.

## Next Entry

Resume `.trellis/tasks/10-23-tos-oss-migration/verification.md` and `migration-console.md`. Read-only inventory passes; source ~68k/209GB and target 18,580/69.73GB, zero key overlap. Source changes; no copy/switch. Production access, TLS, browser/video and frozen delta remain. Switch/deletion need approval; retain source >=7 days. Qwen is committed; activation/paid acceptance separate. Gemini live testing paused.

## Risks And Unknowns

- Existing ignored runtime-import scripts have 17 lint errors; full baseline previously stopped there. At Gemini startup the typical context exceeded 70 KB by 477 bytes; older status details were archived without weakening the gate.
- Text reasoning effort must be supported by the configured model and provider; unsupported values surface the upstream error without stripping or retrying the parameter.
- Gemini live text/image acceptance remains pending. Minimal diagnostics were authorized, then explicitly paused; do not send further calls until resumed.
- ToAPIs ordinary ratio/tier versus VIP/Official pixels live acceptance is unconfirmed. Concurrent Vision failures previously returned upstream 502 HTML; explicit retry is required by the one-attempt queue.
- Real 621-asset runtime migration and authenticated gallery/multi-user review remain operator gates; isolated fixture migration passed. PostgreSQL subtree benchmark P95 is 252.6ms against 300ms.
- No paid Qwen model, storage write or publishing acceptance. Current npm audit: 21 advisories (2 moderate/18 high/1 critical); no forced fix. Qwen key backup is operator-managed. See OSS task evidence.
- Stationary Mac Chrome Canvas flicker cause remains unconfirmed; Windows evidence points to edge animations/compositing as a candidate only.

History: `archive/status-2026-10-19-before-gemini.md`; tasks: `.trellis/tasks/archive/`.
