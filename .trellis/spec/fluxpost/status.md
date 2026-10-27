# FluxPost Current Status

Last updated: 2026-10-27

## One-Line Status

Ordinary library restored on LAN 3001; generated indexing retired. Backup and authenticated gallery checks passed.

## Current Focus

- Generated library retired: 22,255 index assets and three tables removed without a cleanup backup. Ordinary assets remain: 2,301; nonempty collections: 24; memberships: 2,230; labels: 5,302.
- Qwen `0b775c7` included in authorized LAN release; Gemini live testing paused.

## Next Entry

Recovery evidence: `.trellis/tasks/archive/2026-10/10-27-10-27-remove-generated-image-library/recovery-verification.md`. No reimport or generated-table recreation. Cloud copy stays stopped.

## Risks And Unknowns

- Baseline stops at 17 existing ignored-script lint errors; no gate weakened.
- Text reasoning effort must be supported by the configured model and provider; unsupported values surface the upstream error without stripping or retrying the parameter.
- Gemini live text/image acceptance remains pending. Minimal diagnostics were authorized, then explicitly paused; do not send further calls until resumed.
- ToAPIs ordinary ratio/tier versus VIP/Official pixels live acceptance is unconfirmed. Concurrent Vision failures previously returned upstream 502 HTML; explicit retry is required by the one-attempt queue.
- Real 621-asset runtime migration and authenticated gallery/multi-user review remain operator gates; isolated fixture migration passed. PostgreSQL subtree benchmark P95 is 252.6ms against 300ms.
- No paid Qwen model or publishing acceptance. Local OSS copy stopped. Audit: 21 advisories (2 moderate/18 high/1 critical); no forced fix. Qwen key backup is operator-managed.
- Stationary Mac Chrome Canvas flicker cause remains unconfirmed; Windows evidence points to edge animations/compositing as a candidate only.
- Never roll back to generated-table-dependent `72dca31`. Recovery code: `4791dcc`; final identity is in the ignored activation receipt.
- Historical per-ID and cloud-original completeness remain unproven; current inventory is backed up.

History: `archive/status-2026-10-19-before-gemini.md`; tasks: `.trellis/tasks/archive/`.
