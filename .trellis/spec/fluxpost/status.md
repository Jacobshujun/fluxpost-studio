# FluxPost Current Status

Last updated: 2026-10-19

## One-Line Status

Canvas cancellation repair implemented: durable cancellation, stale-write fences and abortable bounded image encoding pass focused checks. Clean local activation and scoped recovery are next; gallery operator review remains.

## Current Focus

- 2026-10-19: Cancellation repair passes focused worker/resource/storage/scheduler/iteration tests, real PostgreSQL temporary-table SQL, types, changed-source lint, standalone build/native encoder and isolated HTTP/SQLite checks. Full baseline reaches unchanged runtime-import lint blocker. Live recovery preview preserves 30 completed main tasks and selects eight orphan cancellations; activation/recovery pending.

- 2026-10-19: Canvas scheduling diagnosis only. Reported video batch has 30/38 completed main tasks and eight abandoned collection runs with expired leases and pending cancellation. Current process has eight live image-processing runs occupying all execution slots; newer launches persist but wait. HTTP identity responds and PostgreSQL shows no blocking locks. Exact image substep and original collection/process-exit trigger remain unconfirmed. All deterministic baseline checks pass before the existing 17 runtime-import lint errors stop execution. No runtime writes, retries, provider calls or restart. Evidence and recovery proposal: archived `10-19-canvas-schedule-lockup/diagnosis.md`.

- 2026-10-14: Both gallery UX phases implemented. Filter/date/URL, library runtime/batch and six 1440/390 three-theme browser checks pass, along with source lint, types, build and HTTP/SQLite checks. Full baseline stops only at 17 pre-existing lint errors in ignored `data/feishu-copy-import` scripts; remaining steps pass separately. Clean implementation 3147e19 activated with `npm run local:lan`; identity/smoke and 0.0.0.0 binding pass. Evidence: archived library-ux task; final runtime SHA is recorded in the ignored candidate state. No external calls or real asset mutations used.

- 2026-10-12: Canvas LAN flicker diagnosis only; no application changes. User reports stationary partial-node titles/borders/edges flicker on Mac Chrome. Candidate matches HEAD; read-only workflow inspection found 22 nodes/24 edges and three completed runs. Windows Chrome with intercepted real-layout/run fixtures and substitute images showed no stationary remounts, recurring size changes or API calls. Its 18 visible completed edges ran 54 animations: six seconds produced 360 style recalculations; disabling beams produced zero and fewer compositor layers. Persistent viewport `will-change: transform` is another compositing boundary. Animation/compositor interaction is a candidate trigger; Mac-device cause remains pending confirmation. Synthetic loopback/LAN pan tests recreated 13 nodes, but cannot explain stationary flicker. All deterministic baseline contracts passed before existing runtime-data lint errors stopped the baseline.

- Earlier candidate/library/Canvas evidence: archive/status-2026-10-14-library-ux.md and the referenced archived tasks. Existing feature states and provider gates remain unchanged.

## Next Entry

Finish standalone packaging and isolated smoke, commit verified changes, activate with `npm run local:lan`, then apply scoped cancellation/image interruption recovery with local backups. Preserve completed outputs and verify queued work progresses. Task: `10-19-canvas-cancellation-recovery`.

## Risks And Unknowns

- ToAPIs: ordinary uses ratio/tier; VIP/Official use pixels. Live acceptance is unconfirmed.
- The real 621-asset runtime database has not been migrated in this dirty-tree verification; the migration was exercised only against isolated fixtures and will run when an approved clean candidate is activated.
- The PostgreSQL collection-subtree benchmark measured P95 `252.6ms` against the `300ms` target and is the closest performance margin as data grows.
- No paid model, TOS write, TikHub, Feishu, Lark, or publishing acceptance was exercised.
- Earlier production deployment is verified; gallery UX is local only, with authenticated operator acceptance pending.
- 2026-08-31 Canvas batch incident: repeated Vision failures were upstream `502` Cloudflare HTML responses from the configured OpenAI-compatible text gateway during a concurrent shared-stage burst; later requests succeeded, and the local baseline remains green. The Canvas run queue currently gives these runs one attempt, so recovery requires retrying the failed shared stage.
- Nine high-severity transitive advisories remain; do not run `npm audit fix --force`.

## History

Detailed task evidence is in `.trellis/tasks/archive/`; older project evidence is under `.trellis/spec/fluxpost/archive/` and the bounded handoff/progress latest blocks.
