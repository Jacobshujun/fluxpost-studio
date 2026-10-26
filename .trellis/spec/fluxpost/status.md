# FluxPost Current Status

Last updated: 2026-10-26

## One-Line Status

Generated library verified in isolation; commit confirmation pending. OSS remains read-only; no activation or deployment.

## Current Focus

- Generated library: SQLite/PostgreSQL and three-theme desktop/mobile pass; see `.trellis/tasks/10-26-generated-image-library/verification.md`. Commit confirmation pending; OSS preserved.
- Qwen `0b775c7` activation pending; Gemini live testing paused. Previous verified work and evidence paths: `archive/status-2026-10-26-before-generated-library.md`.

## Next Entry

Confirm generated-library commit plan, stage task-only hunks, then archive. OSS remains separate: `.trellis/tasks/10-23-tos-oss-migration/verification.md`; no copy/switch. Dirty worktree blocks 3001 activation.

## Risks And Unknowns

- Existing ignored runtime-import scripts have 17 lint errors; full baseline stops there. Status history is archived to preserve the 70 KB context gate.
- Text reasoning effort must be supported by the configured model and provider; unsupported values surface the upstream error without stripping or retrying the parameter.
- Gemini live text/image acceptance remains pending. Minimal diagnostics were authorized, then explicitly paused; do not send further calls until resumed.
- ToAPIs ordinary ratio/tier versus VIP/Official pixels live acceptance is unconfirmed. Concurrent Vision failures previously returned upstream 502 HTML; explicit retry is required by the one-attempt queue.
- Real 621-asset runtime migration and authenticated gallery/multi-user review remain operator gates; isolated fixture migration passed. PostgreSQL subtree benchmark P95 is 252.6ms against 300ms.
- No paid Qwen model, storage write or publishing acceptance. Current npm audit: 21 advisories (2 moderate/18 high/1 critical); no forced fix. Qwen key backup is operator-managed. See OSS task evidence.
- Stationary Mac Chrome Canvas flicker cause remains unconfirmed; Windows evidence points to edge animations/compositing as a candidate only.

History: `archive/status-2026-10-19-before-gemini.md`; tasks: `.trellis/tasks/archive/`.
