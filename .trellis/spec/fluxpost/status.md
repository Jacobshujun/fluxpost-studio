# FluxPost Current Status

Last updated: 2026-10-28

## One-Line Status

LAN 3001 unchanged. OSS delta copy verified; both stores list 71,585 media keys. Database backed up; historical-reference policy pending before switch.

## Current Focus

- Wonder Image Canvas node is implemented and ready for review; clean candidate `57cba03` is active on LAN 3001. Real Yike/media acceptance is pending.
- Generated library retired: 22,255 index assets and three tables removed without a cleanup backup. Ordinary assets remain: 2,301; nonempty collections: 24; memberships: 2,230; labels: 5,302.
- Qwen `0b775c7` included in authorized LAN release; Gemini live testing paused.

## Next Entry

OSS: `.trellis/tasks/10-28-oss-acceptance-local-cutover/verification.md`. Cutover execution authorized; preserve historical missing links pending review. No database/config switch yet. No generated-table recreation.

## Risks And Unknowns

- Wonder Image has no live Yike acceptance; its API/model/media behavior remains pending operator validation. No real credentials were used.
- Latest baseline stops at the 70 KB context budget, before tests. Existing 17 ignored-script lint errors remain; no gate weakened.
- Text reasoning effort must be supported by the configured model and provider; unsupported values surface the upstream error without stripping or retrying the parameter.
- Gemini live text/image acceptance remains pending. Minimal diagnostics were authorized, then explicitly paused; do not send further calls until resumed.
- ToAPIs ordinary ratio/tier versus VIP/Official pixels live acceptance is unconfirmed. Concurrent Vision failures previously returned upstream 502 HTML; explicit retry is required by the one-attempt queue.
- Real 621-asset runtime migration and authenticated gallery/multi-user review remain operator gates; isolated fixture migration passed. PostgreSQL subtree benchmark P95 is 252.6ms against 300ms.
- No paid Qwen/publishing acceptance. OSS delta: 185 files/263.7 MB verified, listings aligned at 10:09 CST. Historical links include confirmed dual-404 samples; current 2,301 library keys present. No cutover. Qwen key backup is operator-managed.
- Stationary Mac Chrome Canvas flicker cause remains unconfirmed; Windows evidence points to edge animations/compositing as a candidate only.
- Never roll back to generated-table-dependent `72dca31`. Recovery code: `4791dcc`; final identity is in the ignored activation receipt.
- Historical per-ID and cloud-original completeness remain unproven; current inventory is backed up.

History: `archive/status-2026-10-19-before-gemini.md`; tasks: `.trellis/tasks/archive/`.
