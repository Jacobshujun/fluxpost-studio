# FluxPost Current Status

Last updated: 2026-11-10

## One-Line Status

Switch Any verified; operator acceptance pending. Runtime identity: `/api/version`.

## Current Focus

- Switch Any: baseline/six browser cases pass; operator acceptance pending. Evidence: `archive/2026-11/11-10-canvas-switch-any/verification.md`; contract `canvas_switch_any.md`.
- Gallery preview: checks pass; `11-09-gallery-preview-stable`.
- Canvas history: `11-09-canvas-schedule-history-fix` verified.
- Text concatenation: 16 inputs verified; operator acceptance pending. Evidence: `archive/2026-11/11-06-canvas-text-concatenate/verification.md`.
- Library sorting/filter isolation verified; operator acceptance pending. Contract: `unified_library.md`; evidence: `11-06-canvas-library-sorting`.
- Nov 5 startup: Job independence/24-GiB heap, baseline and LAN activation pass. Evidence: `archive/2026-11/11-05-local-independent-runtime/verification.md`.
- Canvas workers: 32/default, 100/cap verified; LAN identity: `/api/version`.
- Review filter memory verified; operator acceptance pending. Contract: `review_desk.md`; task `11-05-review-filter-memory`.
- Nov 4 afternoon exit remains unattributed; recovery verified. Evidence: `archive/2026-11/11-04-local-afternoon-exit/findings.md`.
- Batch creation: V2 wizard and V1/V2 favorites verified; archived `11-04-batch-create-wizard` and `11-04-batch-task-favorites`. Operator acceptance pending; identity: `/api/version`.
- Content editor drop/paste/zoom/drag verified; operator acceptance pending. Contract: `content_pool_editing.md`.
- Local diagnostics: retention limits and verified startup in `local_diagnostics.md`; evidence: `archive/2026-11/11-03-local-crash-logging/verification.md`.
- Nov 4 OOM repair `514bf40`: bounded SQL history/reuse verified on SQLite/PG. Contract: `canvas_history.md`; evidence: `archive/2026-11/11-04-canvas-history-memory/verification.md`. Heap: `local_diagnostics.md`; past fatal request unproven.
- Feishu: eight reproduced risks (media omission, edit overwrite, path escape, deleted-post revival, record/lease persistence); fixes/live acceptance pending. Evidence: `11-03-feishu-publish-owner-recovery/code-review-2026-11-03.md`.
- Content-pool performance verified on LAN: desk 960ms, summary 898ms. Authenticated 3001 timing pending; details below.
- Content-pool libraries: owner-scoped rail with subsets, default library, tags and Canvas filters; checks pass, PostgreSQL review remains.
- Review LAN fixes: dialog `505c9b9`, drag `725271b`, image/video ratios `0428b64`; verified in archived `11-02-review-gallery-drag-regression`, `11-02-review-image-preview-3-4`.
- Review layout/order/time verified: archived `10-30-review-desk-usability`.
- Iteration/modes verified on LAN; archives: `canvas-iteration-batch-params`, `canvas-universal-modes`.
- Wonder Image existing-media reuse was accepted on LAN `ec0cd9f`; real Yike/model acceptance is pending.
- Generated library retired: 22,255 index assets and three tables removed without a cleanup backup. Ordinary assets remain: 2,301; nonempty collections: 24; memberships: 2,230; labels: 5,302.
- Qwen `0b775c7` included in authorized LAN release; Gemini live testing paused.

## Next Entry

Content-pool performance: record authenticated 3001 timings for library create/add, desk filtering/load-more and crawl ingest. P2 item table/GIN replacement remains separate; 878 MB GIN and 222 MB JSON are unchanged.

OSS evidence: `.trellis/tasks/archive/2026-10/10-28-oss-acceptance-local-cutover/verification.md`. Local cutover complete; retain TOS >= Nov 4. Production and historical-link cleanup require separate scope. No generated-table recreation.

## Risks And Unknowns

- Nov 10 batch-reference diagnosis: vehicle preprocessing rejects >40 MP originals; failed connected optional GPT image inputs can be omitted while generation continues. Baseline passes; evidence and repair directions: `archive/2026-11/11-10-batch-reference-image-investigation/findings.md`. No application repair or provider replay performed.
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
