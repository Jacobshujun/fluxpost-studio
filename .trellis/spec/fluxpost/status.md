# FluxPost Current Status

Last updated: 2026-10-14

## One-Line Status

Gallery UX implementation verified: generic filters, unified viewer and management; six mocked theme/viewport checks pass. User review and clean-HEAD local activation remain.

## Current Focus

- 2026-10-14: Both gallery UX phases implemented. Filter/date/URL, library runtime/batch and six 1440/390 three-theme browser checks pass, along with source lint, types, build and HTTP/SQLite checks. Full baseline stops only at 17 pre-existing lint errors in ignored `data/feishu-copy-import` scripts; remaining steps pass separately. Evidence: library-ux task. No external services or real asset mutations used.

- 2026-10-12: Canvas LAN flicker diagnosis only; no application changes. User reports stationary partial-node titles/borders/edges flicker on Mac Chrome. Candidate matches HEAD; read-only workflow inspection found 22 nodes/24 edges and three completed runs. Windows Chrome with intercepted real-layout/run fixtures and substitute images showed no stationary remounts, recurring size changes or API calls. Its 18 visible completed edges ran 54 animations: six seconds produced 360 style recalculations; disabling beams produced zero and fewer compositor layers. Persistent viewport `will-change: transform` is another compositing boundary. Animation/compositor interaction is a candidate trigger; Mac-device cause remains pending confirmation. Synthetic loopback/LAN pan tests recreated 13 nodes, but cannot explain stationary flicker. All deterministic baseline contracts passed before existing runtime-data lint errors stopped the baseline.

- Earlier candidate/library/Canvas evidence: archive/status-2026-10-14-library-ux.md and the referenced archived tasks. Existing feature states and provider gates remain unchanged.

## Next Entry

Commit verified gallery work, activate clean primary-worktree HEAD with `npm run local:lan`, verify identity, then authenticated operator review.

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
