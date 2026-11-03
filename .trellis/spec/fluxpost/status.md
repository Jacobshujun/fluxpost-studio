# FluxPost Current Status

Last updated: 2026-11-03

## One-Line Status

Bounded local crash diagnostics verified on LAN. Historical exit-134 trigger remains unproven; active identity is in `/api/version`.

## Current Focus

- Temp cleanup: 253 removed, 46 kept; task root-tmp-cleanup.
- Local diagnostics: logs <=100 MiB; reports <=3 / 7 days / 30 MiB. Baseline/Windows checks pass. User requested LAN cutover; managed startup, identity, diagnostic flags/receipt and loopback/LAN pages pass. Contract: `local_diagnostics.md`; evidence: `archive/2026-11/11-03-local-crash-logging/verification.md`.
- Crashes: exit 134 at ~16:38 and ~16:43; fatal trigger unproven. Evidence: `archive/2026-11/11-03-local-crash-diagnosis/verification.md`.
- Feishu publishing: eight offline-reproduced risks include media skipping/omission, edit overwrite, path escape, deleted-post revival and record/lease persistence. Application unchanged; fixes and live acceptance remain. Evidence: `11-03-feishu-publish-owner-recovery/code-review-2026-11-03.md`.
- Content-pool performance: row-scoped library/item writes; paginated desk/summary/ids with `raw` stripped; baseline, types, build, browser and PG timing pass (desk 960ms, summary 898ms). Committed and active on LAN; authenticated 3001 timing remains.
- Content-pool libraries: owner-scoped rail with subsets, default library, tags and Canvas filters; checks pass, PostgreSQL review remains.
- Review filter dialog: opaque `--panel-solid` prevents editor/media bleed-through. Baseline, active-LAN computed background and dark screenshot pass; committed `505c9b9` and active on LAN.
- Review gallery drag fix: the per-image fieldset disables only under the media lock, so `dragstart` no longer disables the drag handle; up/down/delete/regenerate disable individually during drag. Headed Chrome real-mouse drag, the 45-case three-theme suite and the 153-step baseline pass. Committed `725271b` and activated on LAN. Evidence: archived 11-02-review-gallery-drag-regression task.
- Review image previews: 3:4 images, 4:3 videos, 112px desktop grid and media-specific badge placement pass 45 three-theme cases, interaction/video/series/scrollbar checks, performance and baseline. Committed `0428b64` and active on LAN; real authenticated review remains. Evidence: 11-02-review-image-preview-3-4 task.
- Review desk usability: responsive 960/1600 layout, free insertion ordering for ordinary and series cards (including missing-image cards), and versioned Beijing-time structured filters verified on the exact tree: 153-step baseline, opt-in PostgreSQL, 30-case three-theme browser suite and performance regressions. LAN activation passed build/identity/smoke with `/review` 200 on loopback and LAN. Evidence: archived 10-30-review-desk-usability task; active SHA in `/api/version` and launcher receipt. Real authenticated operator review remains.
- Iteration batch fix on LAN. Evidence: archived canvas-iteration-batch-params task.
- Universal Canvas modes pass six mode and six group browser cases; impossible routes report errors. LAN smoke passed. Evidence: archived canvas-universal-modes task.
- Wonder Image existing-media reuse was accepted on LAN `ec0cd9f`; real Yike/model acceptance is pending.
- Generated library retired: 22,255 index assets and three tables removed without a cleanup backup. Ordinary assets remain: 2,301; nonempty collections: 24; memberships: 2,230; labels: 5,302.
- Qwen `0b775c7` included in authorized LAN release; Gemini live testing paused.

## Next Entry

Content-pool performance: record authenticated 3001 timings for library create/add, desk filtering/load-more and crawl ingest. P2 item table/GIN replacement remains separate; 878 MB GIN and 222 MB JSON are unchanged.

OSS evidence: `.trellis/tasks/archive/2026-10/10-28-oss-acceptance-local-cutover/verification.md`. Local cutover complete; retain TOS >= Nov 4. Production and historical-link cleanup require separate scope. No generated-table recreation.

## Risks And Unknowns

- Desk scans ~46 MB light rows (~0.9 s); item edits rewrite project JSON. Below ~150 ms needs P2.
- Latest Wonder report: ImportMedia `MediaAlreadyExist`. LAN ID reuse repair preserves GetMedia readiness and Overwrite=false; no manual live replay. See archived wonder-existing-media task; earlier auth cause unproven.
- ESLint excludes local `data/` artifacts; lint passes with 0 errors/16 source warnings. Full baseline passes (2026-10-30); source rules and LAN unchanged.
- Text reasoning effort must be supported by the configured model and provider; unsupported values surface the upstream error without stripping or retrying the parameter.
- Gemini live text/image acceptance remains pending. Minimal diagnostics were authorized, then explicitly paused; do not send further calls until resumed.
- ToAPIs ordinary ratio/tier versus VIP/Official pixels live acceptance is unconfirmed. Concurrent Vision failures previously returned upstream 502 HTML; explicit retry is required by the one-attempt queue.
- Real 621-asset runtime migration and authenticated gallery/multi-user review remain operator gates; isolated fixture migration passed. PostgreSQL subtree benchmark P95 is 252.6ms against 300ms.
- No paid Qwen/publishing acceptance. Local OSS verified: 2,301 assets, 1,637 copy entries preserved. Historical missing URLs and nine TOS-pending files retained. Production unchanged. Qwen key backup is operator-managed.
- Stationary Mac Chrome Canvas flicker cause remains unconfirmed; Windows evidence points to edge animations/compositing as a candidate only.
- Never roll back to generated-table-dependent `72dca31`. Recovery code: `4791dcc`; final identity is in the ignored activation receipt.
- Historical per-ID and cloud-original completeness remain unproven; current inventory is backed up.

History: `archive/status-2026-10-19-before-gemini.md`; tasks: `.trellis/tasks/archive/`.
