# FluxPost Current Status

Last updated: 2026-09-30

## One-Line Status

Canvas save-images supports host-local folders, exclusive numbered files and retry receipts. Filesystem, snapshot and desktop/mobile checks pass; existing data-script lint blocks baseline. Contract: canvas_local_image_save.md. Task: canvas-local-save.

## Current Focus

- 2026-09-30: Local image saving verified, including three-theme 1440/390 input/results and clear-folder behavior. Local delivery uses the clean-HEAD LAN wrapper; identity: `/api/version`. Evidence: archived canvas-local-save task. No remote release.

- 2026-09-28: Xiaopeng rich-video parsing fixed; reimport required. Evidence: archived xiaopeng-rich-video task.

- 2026-09-21: Dongchedi failure guidance fixed; focused checks pass. Baseline blocked by existing data-directory lint errors.

- 2026-09-20: Selection-only Canvas inspector; baseline and three-theme desktop/mobile checks pass. Evidence: canvas-inspector-selection task.

- 2026-09-20: gpt-image-quality: five levels; baseline/browser pass.

- 2026-09-18: Canvas groups/shortcuts: archived canvas-groups-shortcuts task.
  Full baseline, three-theme 1440/390 browser and LAN activation pass.

- 2026-09-18: FRP application https://ximage.lightmoment.net/ and desktop launcher updated. TLS/renewal/assets/range and baseline pass; evidence: frp-vps-38 HTTPS follow-up.

- 2026-09-18: FRP dashboard https://flux.lightmoment.net:6443/; TLS/auth/proxy and baseline pass. Credentials local, SSH retained. Evidence: archived frp-dashboard-public task.

- FRP relay and public-launcher installation evidence: archived frp-vps-38 and
  desktop-frp-launcher tasks. Current HTTPS entry is above.

- Desktop LAN launcher: baseline/identity pass; other-device access pending.
  Evidence: archived desktop-lan-launcher task.

- Layer composition September 17 evidence and pending review: archive/status-2026-09-30-local-save.md. Contract: canvas_layer_compose.md.

- 2026-09-16: Single-PNG mask input preserves alpha. Evidence: .trellis/tasks/archive/2026-09/09-16-canvas-alpha-overlay/verification.md.

- 2026-09-16: Simple image strategy passes baseline/browser. Evidence: .trellis/tasks/archive/2026-09/09-16-simple-gpt-image-strategy/verification.md.

- 2026-09-16: Node model presets/custom IDs and explicit ToAPIs formats pass baseline/browser. Task: .trellis/tasks/archive/2026-09/09-16-canvas-image-model-routing/.

- Image contracts: toapis_image_contract.md.

- VIP: Flare completed; edits failed. Stop paid retries; billing unknown. See pitfalls.md.

- Earlier provider rejections: see pitfalls.md.

- Image proxy release authorized; offline evidence and pending checks: .trellis/tasks/archive/2026-09/09-10-image-proxy-toggle/verification.md.

- September 9 bodies; background not sent. UI: .trellis/tasks/archive/2026-09/09-10-simple-image-quality-background/verification.md.

- 2026-09-10 iteration repair: Handles and nested deletion pass offline/browser checks. Evidence: .trellis/tasks/archive/2026-09/09-10-canvas-iteration-interactions/verification.md. Commit authorized; no activation/push/live calls.

- 2026-09-09 image sizing: Shared Canvas ratio/tier choices, frozen resume and legacy reselection pass offline/browser checks. Task: .trellis/tasks/archive/2026-09/09-09-exact-image-pixels. Commit authorized; no activation/live call.
- Production/GitHub main: 1298237; parity pending. Local candidate identity: `/api/version`.

- Collection, simple image-discard and September 8 copy-library verification/release evidence: see archive/status-2026-09-09.md. Their feature states are unchanged.

- 2026-09-07: Composition review defaults on; skipped review approves drafts, reruns preserve published posts. Full baseline passed.
- 2026-09-07: Mask zero-edge geometry/cache and video-only previews pass baseline.
- 2026-09-07: Node-library labels align via a fixed icon column; desktop/mobile browser and full baseline pass.
- 2026-09-07: Canvas `input.library-images` now stays idle until filtered, loads 24-item count-free pages with lazy thumbnails, memoizes Flow nodes, and supports conditional thumbnail 304 responses. Full offline baseline passed.
- 2026-09-04: The verified local candidate `75d35adb5dd699862d2ecfc90459da0d1a678e1a` is synchronized to GitHub `origin/main`; production remains unchanged.

- Earlier library, scheduler, route-state and generation verification: archive/status-2026-09-17-library-batches.md.
- 2026-09-03: Typed image/video masks, region modes, timing, geometry and caching pass baseline. Contract: canvas_media_mask.md.
- 2026-09-03: Full reruns select the latest result ahead of stale URL run IDs. Mask and full baseline checks pass.

## Next Entry

Continue authenticated operator review of the unified library and run the one-time runtime migration when approved.

## Risks And Unknowns

- ToAPIs: ordinary uses ratio/tier; VIP/Official use pixels. Live acceptance is unconfirmed.
- The real 621-asset runtime database has not been migrated in this dirty-tree verification; the migration was exercised only against isolated fixtures and will run when an approved clean candidate is activated.
- The PostgreSQL collection-subtree benchmark measured P95 `252.6ms` against the `300ms` target and is the closest performance margin as data grows.
- No paid model, TOS write, TikHub, Feishu, Lark, or publishing acceptance was exercised.
- Production deployment is verified; local activation and authenticated operator acceptance remain pending.
- 2026-08-31 Canvas batch incident: repeated Vision failures were upstream `502` Cloudflare HTML responses from the configured OpenAI-compatible text gateway during a concurrent shared-stage burst; later requests succeeded, and the local baseline remains green. The Canvas run queue currently gives these runs one attempt, so recovery requires retrying the failed shared stage.
- Nine high-severity transitive advisories remain; do not run `npm audit fix --force`.

## History

Detailed task evidence is in `.trellis/tasks/archive/`; older project evidence is under `.trellis/spec/fluxpost/archive/` and the bounded handoff/progress latest blocks.
