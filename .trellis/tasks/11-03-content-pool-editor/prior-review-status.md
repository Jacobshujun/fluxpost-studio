# Prior review status entries

Moved verbatim from status.md to keep required startup context within budget.

- Review gallery drag fix: the per-image fieldset disables only under the media lock, so `dragstart` no longer disables the drag handle; up/down/delete/regenerate disable individually during drag. Headed Chrome real-mouse drag, the 45-case three-theme suite and the 153-step baseline pass. Committed `725271b` and activated on LAN. Evidence: archived 11-02-review-gallery-drag-regression task.

- Review image previews: 3:4 images, 4:3 videos, 112px desktop grid and media-specific badge placement pass 45 three-theme cases, interaction/video/series/scrollbar checks, performance and baseline. Committed `0428b64` and active on LAN; real authenticated review remains. Evidence: 11-02-review-image-preview-3-4 task.

- Review desk usability: responsive 960/1600 layout, free insertion ordering for ordinary and series cards (including missing-image cards), and versioned Beijing-time structured filters verified on the exact tree: 153-step baseline, opt-in PostgreSQL, 30-case three-theme browser suite and performance regressions. LAN activation passed build/identity/smoke with `/review` 200 on loopback and LAN. Evidence: archived 10-30-review-desk-usability task; active SHA in `/api/version` and launcher receipt. Real authenticated operator review remains.

## Prior verification detail

- 2026-11-02 Review desk usability: exact-tree baseline (153 logged steps, 0 lint errors,
  16 existing warnings, types/build/config sync/HTTP smoke on 45678/SQLite),
  opt-in isolated PostgreSQL filters/save/reorder, three-theme 30-case browser
  suite and review performance regressions pass. Clean-tree `npm run local:lan`
  activated the committed candidate into `.next-local-b` on `0.0.0.0:3001`:
  build, candidate identity, HTTP smoke and `/review` 200 on loopback and LAN
  passed; the receipt records the active SHA. Post-verification audit fixes
  (prompt preservation, async slot identity, series media ownership, shared media
  lock, dragleave, invalid-filter rows, batch trigger, summary labels, asOf reuse)
  re-ran the full baseline, isolated PostgreSQL benchmark and both browser suites
  on the final tree. Real authenticated operator review remains. Logs:
  `test-artifacts/review-usability-*-final.log`,
  `test-artifacts/review-usability-*-fixes*.log`,
  `test-artifacts/review-usability-baseline-final-audit.log`.

