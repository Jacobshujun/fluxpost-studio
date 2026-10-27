# FluxPost Current Status

Last updated: 2026-10-27

## One-Line Status

Material-overflow fix verified; LAN commit/activation authorized. Library-name audit pending; local copy stopped.

## Current Focus

- Generated library: SQLite/PostgreSQL and three-theme desktop/mobile pass; see `.trellis/tasks/archive/2026-10/10-26-generated-image-library/verification.md`. Committed bbe4ff9; OSS preserved.
- Qwen `0b775c7` included in authorized LAN release; Gemini live testing paused. Prior evidence: `archive/status-2026-10-26-before-generated-library.md`.

## Next Entry

Fix evidence: `.trellis/tasks/archive/2026-10/10-27-simple-material-overflow/verification.md`. LAN result: ignored `test-artifacts/lan-material-overflow-release.json`; verify runtime SHA. No replay or filename repair. Cloud copy stays stopped.

## Risks And Unknowns

- Baseline stops at 17 existing ignored-script lint errors; no gate weakened.
- Text reasoning effort must be supported by the configured model and provider; unsupported values surface the upstream error without stripping or retrying the parameter.
- Gemini live text/image acceptance remains pending. Minimal diagnostics were authorized, then explicitly paused; do not send further calls until resumed.
- ToAPIs ordinary ratio/tier versus VIP/Official pixels live acceptance is unconfirmed. Concurrent Vision failures previously returned upstream 502 HTML; explicit retry is required by the one-attempt queue.
- Real 621-asset runtime migration and authenticated gallery/multi-user review remain operator gates; isolated fixture migration passed. PostgreSQL subtree benchmark P95 is 252.6ms against 300ms.
- No paid Qwen model or publishing acceptance. Local OSS copy stopped. Audit: 21 advisories (2 moderate/18 high/1 critical); no forced fix. Qwen key backup is operator-managed.
- Stationary Mac Chrome Canvas flicker cause remains unconfirmed; Windows evidence points to edge animations/compositing as a candidate only.

History: `archive/status-2026-10-19-before-gemini.md`; tasks: `.trellis/tasks/archive/`.
