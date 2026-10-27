# FluxPost Current Status

Last updated: 2026-10-27

## One-Line Status

Ordinary library recovery approved; backup verified. Port 3001 still runs incompatible old code; activation pending.

## Current Focus

- Generated library retired: 22,255 index assets and three tables removed without a cleanup backup. Ordinary assets remain: 2,301; nonempty collections: 24; memberships: 2,230; labels: 5,302.
- Qwen `0b775c7` included in authorized LAN release; Gemini live testing paused.

## Next Entry

Execute `.trellis/tasks/10-27-10-27-remove-generated-image-library/recovery-plan.md`: verify, commit, activate LAN candidate. No reimport or generated-table recreation. Cloud copy stays stopped.

## Risks And Unknowns

- Baseline stops at 17 existing ignored-script lint errors; no gate weakened.
- Text reasoning effort must be supported by the configured model and provider; unsupported values surface the upstream error without stripping or retrying the parameter.
- Gemini live text/image acceptance remains pending. Minimal diagnostics were authorized, then explicitly paused; do not send further calls until resumed.
- ToAPIs ordinary ratio/tier versus VIP/Official pixels live acceptance is unconfirmed. Concurrent Vision failures previously returned upstream 502 HTML; explicit retry is required by the one-attempt queue.
- Real 621-asset runtime migration and authenticated gallery/multi-user review remain operator gates; isolated fixture migration passed. PostgreSQL subtree benchmark P95 is 252.6ms against 300ms.
- No paid Qwen model or publishing acceptance. Local OSS copy stopped. Audit: 21 advisories (2 moderate/18 high/1 critical); no forced fix. Qwen key backup is operator-managed.
- Stationary Mac Chrome Canvas flicker cause remains unconfirmed; Windows evidence points to edge animations/compositing as a candidate only.
- Old `72dca31` ordinary list/navigation fail on dropped tables (`42P01`); it is not a healthy rollback. Recovery activation is approved, not yet executed.
- Historical per-ID and cloud-original completeness remain unproven; current inventory is backed up.

History: `archive/status-2026-10-19-before-gemini.md`; tasks: `.trellis/tasks/archive/`.
