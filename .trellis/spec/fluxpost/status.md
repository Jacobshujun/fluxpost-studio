# FluxPost Current Status

Last updated: 2026-08-20

## One-Line Status

Local A/B build-slot isolation is committed and active on port 3001; successful slot switching and controlled startup-failure restoration are verified against the same clean SHA.

## Current Focus

- The primary worktree owns two ignored Next build slots. Development and verification builds do not overwrite the slot serving port 3001.
- `npm run local` builds clean committed HEAD into the inactive slot before stopping the listener, records slot/SHA identity only after health passes, and restores the previous managed slot on activation failure.
- Fixed slot selection, primary-worktree/clean-tree guards, generated-type and ESLint exclusions, PowerShell syntax, both real slot builds, the complete offline baseline, and an actual failed-startup restoration pass.
- Port 3001 runs clean candidate `0909776383c05eab37a2f66a0b2443dde693e2da` from `.next-local-b`; the ignored state file reports the same slot and SHA. Existing unrelated dirty changes in `src/lib/canvas/executors.ts` and `canvas_workflows_check.mjs` remain outside this task.

## Next Entry

Observe the versioned local candidate on port 3001. Push, production deployment, and final local/GitHub/production parity remain separate approval gates.

## Recent Verification

- 2026-08-20: Committed SHA `0909776383c05eab37a2f66a0b2443dde693e2da` activated through slot A then slot B; a controlled missing-`BUILD_ID` startup failure restored slot A with the same SHA and passed full HTTP smoke before the final healthy slot-B activation.
- 2026-08-20: Local A/B slot contracts, PowerShell syntax, slot-A/slot-B production builds without tracked config churn, lint, TypeScript, isolated HTTP/SQLite smoke, and the complete offline baseline passed without external calls; port 3001 remained available on the prior candidate.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Historical local-only media not present in TOS could not be recovered from NTFS without corruption; PostgreSQL rows remain intact and missing files may require source recache or regeneration.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
