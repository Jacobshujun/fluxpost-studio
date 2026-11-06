# FluxPost Current Status

Last updated: 2026-11-06

## One-Line Status

Canvas text concatenation now expands to 16 ordered inputs; baseline/browser verified. Local release identity: `/api/version`.

## Current Focus

- Nov 6 text concatenation: GPT-style progressive inputs (1–16), stable legacy A-D handles, ordered execution and six theme/viewport browser checks pass. Evidence: `archive/2026-11/11-06-canvas-text-concatenate/verification.md`. Operator acceptance pending.
- Nov 6 library sorting/filter isolation: SQLite/PG, six browser flows and regressions pass. Contract: `unified_library.md`; evidence: `11-06-canvas-library-sorting`. Operator acceptance pending.
- Nov 5 startup: Job independence/24-GiB heap, baseline and LAN activation pass. Evidence: `archive/2026-11/11-05-local-independent-runtime/verification.md`.
- Canvas workers: 32/default, 100/cap verified; LAN identity: `/api/version`.
- Review filter memory: offline/six browser flows/45-layout pass. Contract: `review_desk.md`; task `11-05-review-filter-memory`. Operator acceptance pending.
- Nov 4 afternoon exit remains unattributed; recovery verified. Evidence: `archive/2026-11/11-04-local-afternoon-exit/findings.md`.
- Batch creation: four-step V2 plus original V1/V2; personal favorites/aliases/notes, SQL search/paging and copy-to-edit. Wizard evidence: archived `11-04-batch-create-wizard`; favorites: `11-04-batch-task-favorites`. Operator acceptance pending. LAN release identity: `/api/version`.
- Content-pool editor: manual text/images and recrawl/cache protection; baseline/browser checks pass. Contract: `content_pool_editing.md`; task `11-03-content-pool-editor`; operator acceptance pending.
- Temp files: 297/299 removed; two inventories kept.
- Local diagnostics: logs <=100 MiB; reports <=3 / 7 days / 30 MiB. Baseline/Windows and authorized LAN startup/identity/flags/receipt/HTTP pass. Contract: `local_diagnostics.md`; evidence: `archive/2026-11/11-03-local-crash-logging/verification.md`.
- Nov 4 OOM repair `514bf40`: Canvas SQL history returns 25 rows/~440 KiB instead of 171k/~3.49 GiB; reuse pages 32. SQLite/PG scale and baseline pass. Contract: `canvas_history.md`; evidence: `archive/2026-11/11-04-canvas-history-memory/verification.md`. Heap contract now in `local_diagnostics.md`; exact past fatal request unproven.
- Feishu: eight reproduced risks (media omission, edit overwrite, path escape, deleted-post revival, record/lease persistence); fixes/live acceptance pending. Evidence: `11-03-feishu-publish-owner-recovery/code-review-2026-11-03.md`.
- Content-pool performance: row-scoped writes, paged desk/summary/ids without `raw`; baseline/types/build/browser/PG pass (desk 960ms, summary 898ms). Active on LAN; authenticated 3001 timing pending.
- Content-pool libraries: owner-scoped rail with subsets, default library, tags and Canvas filters; checks pass, PostgreSQL review remains.
- Review fixes active on LAN: opaque dialog `505c9b9`, drag `725271b`, 3:4 images/4:3 videos `0428b64`; baseline/browser pass. Evidence: archived `11-02-review-gallery-drag-regression`, `11-02-review-image-preview-3-4` tasks.
- Review responsive/order/Beijing-time checks passed offline/PG/browser/LAN: archived `10-30-review-desk-usability`.
- Iteration batch and universal modes active on LAN; six mode/six group browser cases and impossible-route errors pass. Archives: `canvas-iteration-batch-params`, `canvas-universal-modes`.
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
