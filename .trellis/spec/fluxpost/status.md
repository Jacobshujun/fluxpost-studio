# FluxPost Current Status

Last updated: 2026-11-02

## One-Line Status

LAN: review desk layout, ordering, structured filters, opaque filter dialog and compact image gallery candidate. Active SHA `a7b7bd633244497683324b6bfc65d8c65558eb9a` in `/api/version` and launcher receipt; `/review` 200 on loopback and `10.182.144.38:3001`. OSS unchanged.

## Current Focus

- Review filter dialog: the advanced-filter modal and its sticky action bar now use opaque `--panel-solid` instead of translucent `--surface-raised`, so editor/media content no longer shows through in the creator dark theme. Baseline passed; verified on the active LAN candidate with computed background `rgb(19, 29, 27)` and a dark-theme screenshot. Committed `505c9b9`; active LAN SHA `a7b7bd6` includes it.
- Review gallery drag fix: the per-image fieldset disables only under the media lock, so `dragstart` no longer disables the drag handle; up/down/delete/regenerate disable individually during drag. Headed Chrome real-mouse drag, the 45-case three-theme suite and the 153-step baseline pass. Committed `725271b` and activated on LAN. Evidence: archived 11-02-review-gallery-drag-regression task.
- Review image gallery layout: restored the compact multi-image grid after the 10-30 rebuild. `>=960px` uses `repeat(auto-fill, minmax(145px, 1fr))`, tiles use preview aspect-ratio without fixed heights, ordering controls are one 24px overlay group, and the prompt editor is compact. Container-query hero rules and a series exclusion keep 4 images visible at 1440x900 and all series cards visible at 1920x1080. Verified with 45 three-theme layout cases, a simulated classic 15px scrollbar, edge autoscroll, reduced motion, full baseline and performance regressions. Committed as `246ff0a` and activated on LAN; `/api/version` and the launcher receipt match. Real authenticated visual review remains. Evidence: archived 11-02-review-image-gallery-layout task.
- Review desk usability: responsive 960/1600 layout, free insertion ordering for ordinary and series cards (including missing-image cards), and versioned Beijing-time structured filters verified on the exact tree: 153-step baseline, opt-in PostgreSQL, 30-case three-theme browser suite and performance regressions. LAN activation passed build/identity/smoke with `/review` 200 on loopback and LAN. Evidence: archived 10-30-review-desk-usability task; active SHA in `/api/version` and launcher receipt. Real authenticated operator review remains.
- Iteration batch fix on LAN. Evidence: archived canvas-iteration-batch-params task.
- Universal Canvas modes pass six mode and six group browser cases; impossible routes report errors. LAN smoke passed. Evidence: archived canvas-universal-modes task.
- Wonder Image existing-media reuse was accepted on LAN `ec0cd9f`; real Yike/model acceptance is pending.
- Generated library retired: 22,255 index assets and three tables removed without a cleanup backup. Ordinary assets remain: 2,301; nonempty collections: 24; memberships: 2,230; labels: 5,302.
- Qwen `0b775c7` included in authorized LAN release; Gemini live testing paused.
- Claude Code Trellis integration installed via `trellis init --claude`: `.claude/` provides SessionStart/UserPromptSubmit/PreToolUse hooks, nine skills, three subagents, and two slash commands. Restart Claude Code to activate; no application code changed.

## Next Entry

OSS evidence: `.trellis/tasks/archive/2026-10/10-28-oss-acceptance-local-cutover/verification.md`. Local cutover complete; retain TOS >= Nov 4. Production and historical-link cleanup require separate scope. No generated-table recreation.

## Risks And Unknowns

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
