# FluxPost Current Status

Last updated: 2026-08-20

## One-Line Status

Local A/B build-slot isolation is implemented and fully verified offline; port 3001 still serves the prior clean candidate until the change is committed and explicitly activated.

## Current Focus

- The primary worktree owns two ignored Next build slots. Development and verification builds do not overwrite the slot serving port 3001.
- `npm run local` builds clean committed HEAD into the inactive slot before stopping the listener, records slot/SHA identity only after health passes, and restores the previous managed slot on activation failure.
- Fixed slot selection, primary-worktree/clean-tree guards, generated-type and ESLint exclusions, PowerShell syntax, both real slot builds, and the complete offline baseline pass.
- Port 3001 remains on clean candidate `8f5cf32fe53b86ff32f840015519609a6f579f29`; first managed-slot activation waits for this task's commit. Existing unrelated dirty changes in `src/lib/canvas/executors.ts` and `canvas_workflows_check.mjs` remain outside this task.

## Next Entry

Commit the verified local-slot change, then run `npm run local` and verify the primary-worktree port-3001 state/slot/SHA markers; no production deployment is planned.

## Recent Verification

- 2026-08-20: Local A/B slot contracts, PowerShell syntax, slot-A/slot-B production builds without tracked config churn, lint, TypeScript, isolated HTTP/SQLite smoke, and the complete offline baseline passed without external calls; port 3001 remained available on the prior candidate.
- 2026-08-20: Primary-worktree startup guard, runtime parity, SQLite validation, lint, TypeScript, build, isolated HTTP smoke, and the complete offline baseline passed.
- 2026-08-20: Read-only PostgreSQL counts confirmed 2,693 generated posts, 3,081 runtime posts, 1,377 simple runs, 54 content projects, 10 Canvas workflows, and 7 accounts.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Historical local-only media not present in TOS could not be recovered from NTFS without corruption; PostgreSQL rows remain intact and missing files may require source recache or regeneration.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
