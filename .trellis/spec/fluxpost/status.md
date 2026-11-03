# FluxPost Current Status

Last updated: 2026-11-03

## One-Line Status

LAN unchanged. Content-pool performance candidate is verified but not yet committed or activated on 3001; activation uses clean committed HEAD and `/api/version` identity.

## Current Focus

- Content-pool performance: row-scoped library/item writes; paginated desk/summary/ids with `raw` stripped; baseline, types, build, browser and PG timing pass (desk 960ms, summary 898ms). Commit/activation and 3001 timing remain.
- Content-pool libraries: owner-scoped rail with subsets, default library, tags and Canvas filters; checks pass, PostgreSQL review remains.
- Review filter dialog: the advanced-filter modal and its sticky action bar now use opaque `--panel-solid` instead of translucent `--surface-raised`, so editor/media content no longer shows through in the creator dark theme. Baseline passed; verified on the active LAN candidate with computed background `rgb(19, 29, 27)` and a dark-theme screenshot. Committed `505c9b9`; included in the active LAN candidate.
- Review gallery drag fix: the per-image fieldset disables only under the media lock, so `dragstart` no longer disables the drag handle; up/down/delete/regenerate disable individually during drag. Headed Chrome real-mouse drag, the 45-case three-theme suite and the 153-step baseline pass. Committed `725271b` and activated on LAN. Evidence: archived 11-02-review-gallery-drag-regression task.
- Review image previews: image tiles now use a 3:4 portrait preview (video tiles keep 4:3), the first-image `16 / 9` hero is removed, and the `>=960px` grid uses `repeat(auto-fill, minmax(112px, 1fr))` so four portrait images stay visible at 1440x900. The image index badge sits at the preview's bottom-left and video keeps it top-left, so overlay controls never cover video controls. Verified with 45 three-theme layout cases, video/series/classic-scrollbar/interaction cases, two performance runs and the full baseline (0 lint errors/16 warnings). Committed `0428b64` and activated on LAN; `/api/version` reports the full SHA and `/review` returns 200 on loopback and LAN. Real authenticated visual review remains. Evidence: 11-02-review-image-preview-3-4 task.
- Review desk usability: responsive 960/1600 layout, free insertion ordering for ordinary and series cards (including missing-image cards), and versioned Beijing-time structured filters verified on the exact tree: 153-step baseline, opt-in PostgreSQL, 30-case three-theme browser suite and performance regressions. LAN activation passed build/identity/smoke with `/review` 200 on loopback and LAN. Evidence: archived 10-30-review-desk-usability task; active SHA in `/api/version` and launcher receipt. Real authenticated operator review remains.
- Iteration batch fix on LAN. Evidence: archived canvas-iteration-batch-params task.
- Universal Canvas modes pass six mode and six group browser cases; impossible routes report errors. LAN smoke passed. Evidence: archived canvas-universal-modes task.
- Wonder Image existing-media reuse was accepted on LAN `ec0cd9f`; real Yike/model acceptance is pending.
- Generated library retired: 22,255 index assets and three tables removed without a cleanup backup. Ordinary assets remain: 2,301; nonempty collections: 24; memberships: 2,230; labels: 5,302.
- Qwen `0b775c7` included in authorized LAN release; Gemini live testing paused.

## Next Entry

Content-pool performance: commit, activate 3001 from clean HEAD, then record authenticated timings. P2 item table/GIN replacement remains separate; 878 MB GIN and 222 MB JSON are unchanged.

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
