# FluxPost Current Status

Last updated: 2026-11-12

## One-Line Status

Local Feishu target verified; live publish pending. Identity: `/api/version`.

## Current Focus

- G9L studio crops: 36 copies in child collection; 47 originals unchanged, 11 detail shots skipped; public hashes/service reads and baseline pass. Evidence: `archive/2026-11/11-12-g9l-studio-crop/verification.md`.
- Gallery hierarchy/rename verified: `archive/2026-11/11-11-gallery-collection-hierarchy/verification.md`.
- Magpie: baseline/browser and LAN identity/HTTP pass; key/live pending. See `magpie_web_search.md`.
- Feishu target/schema/dry-run/baseline pass; text tags supported, imports/audits preserved. Evidence: `archive/2026-11/11-11-feishu-publish-target/verification.md`.
- High-resolution processing: 100 MP / 8K / LAN pass; `canvas_image_process.md`; evidence: `archive/2026-11/11-10-high-resolution-image-processing/verification.md`.
- Switch Any: six browser cases/baseline pass; operator acceptance pending. Contract: `canvas_switch_any.md`; evidence: `archive/2026-11/11-10-canvas-switch-any/verification.md`.
- Gallery delete-next: baseline/browser pass (`11-11-gallery-delete-next`).
- Canvas history: `11-09-canvas-schedule-history-fix` verified.
- Text concatenation: 16 inputs verified; operator pending. Archive: `11-06-canvas-text-concatenate`.
- Library sorting/filter isolation verified; operator pending. Contract: `unified_library.md`; task: `11-06-canvas-library-sorting`.
- Nov 5 startup: independent Jobs/24-GiB heap, baseline/LAN pass; archive: `11-05-local-independent-runtime`.
- Canvas workers: 32/default, 100/cap verified; LAN identity: `/api/version`.
- Review filter memory verified; operator acceptance pending. Contract: `review_desk.md`; task `11-05-review-filter-memory`.
- Nov 4 afternoon exit remains unattributed; recovery verified. Evidence: `archive/2026-11/11-04-local-afternoon-exit/findings.md`.
- Batch wizard/favorites verified; operator acceptance pending. Archives: `11-04-batch-create-wizard`, `11-04-batch-task-favorites`.
- Content editor drop/paste/zoom/drag verified; operator acceptance pending. Contract: `content_pool_editing.md`.
- Diagnostics retention/startup verified: `local_diagnostics.md`; archive: `11-03-local-crash-logging`.
- Nov 4 OOM: SQL history/reuse verified on SQLite/PG (`514bf40`, `canvas_history.md`). Prior fatal request unproven; heap: `local_diagnostics.md`.
- Feishu: eight reproduced risks (media omission, edit overwrite, path escape, deleted-post revival, record/lease persistence); fixes/live acceptance pending. Evidence: `11-03-feishu-publish-owner-recovery/code-review-2026-11-03.md`.
- Content pool LAN: desk 960ms, summary 898ms; authenticated timing pending.
- Content libraries: owner/subsets/default/tags/Canvas filters pass; PostgreSQL review pending.
- Review LAN: dialog/drag/ratios verified; archives: `11-02-review-gallery-drag-regression`, `11-02-review-image-preview-3-4`.
- Review layout/order/time verified: archived `10-30-review-desk-usability`.
- Iteration/modes verified on LAN; archives: `canvas-iteration-batch-params`, `canvas-universal-modes`.
- Wonder Image existing-media reuse was accepted on LAN `ec0cd9f`; real Yike/model acceptance is pending.
- Generated library retired: 22,255 index assets and three tables removed without a cleanup backup. Ordinary assets remain: 2,301; nonempty collections: 24; memberships: 2,230; labels: 5,302.
- Qwen `0b775c7` included in authorized LAN release; Gemini live testing paused.

## Next Entry

Content-pool performance: record authenticated 3001 timings for library create/add, desk filtering/load-more and crawl ingest. P2 item table/GIN replacement remains separate; 878 MB GIN and 222 MB JSON are unchanged.

OSS evidence: `.trellis/tasks/archive/2026-10/10-28-oss-acceptance-local-cutover/verification.md`. Local cutover complete; retain TOS >= Nov 4. Production and historical-link cleanup require separate scope. No generated-table recreation.

## Risks And Unknowns

- Nov 11 batch image diagnosis: a child parameter outside the selected GPT result's dependency path repeated identical-input text generation; aggregation retained a frozen additional vehicle photo. Both review image arrays match composition. Correction pending; no replay/mutation. Evidence: `archive/2026-11/11-11-batch-review-image-mismatch/findings.md`; baseline passed.
- Nov 10 missing-reference diagnosis: high-resolution preprocessing repaired (contract `canvas_image_process.md`); failed connected optional GPT inputs can still be omitted while generation continues (separate repair). Historical evidence: `archive/2026-11/11-10-batch-reference-image-investigation/findings.md`. No provider replay performed.
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
