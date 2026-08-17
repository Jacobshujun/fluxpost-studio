# FluxPost Current Status

Last updated: 2026-08-17

## One-Line Status

Unique historical root WIP is preserved at archive commit 3ba42a9 and excluded from the release; the single-port candidate workflow is being revised and remains unpushed and undeployed.

## Current Focus

- Port 3001 is the only local application environment for development preview and committed candidate testing.
- The candidate keeps public runtime identity and manifest-derived production deploy/rollback identity, but removes SHA-specific local mirror worktrees and state files.
- The tested candidate must be pushed unchanged to GitHub main and deployed by full SHA before final parity.

## Next Entry

1. Complete focused and full deterministic verification, commit the revised candidate, and start that clean SHA on port 3001.
2. Push the exact tested SHA to the candidate branch and GitHub main.
3. Run isolated VPS verification, read-only preflight, exact-SHA deployment, and production safety checks.
4. Remove other local worktrees and redundant branches, then require local/GitHub/production SHA equality.

## Recent Verification

- 2026-08-17: archive branch and annotated tag resolve to 3ba42a920bd8dec466ec721870dd1e1e6869fe5e and preserve only unique root WIP/task evidence.
- 2026-08-17: revised runtime parity and VPS deployment contract checks passed locally before full baseline.
- 2026-08-14: original dual-local parity candidate passed the complete deterministic baseline but was not pushed or deployed.
- 2026-08-14: production release 20260814-085108-39a35f8dd869 passed health, auth, workers, schema, volumes, retention, logs, and rollback checks.

## Risks And Unknowns

- Current production predates /api/version; its exact live SHA cannot be publicly proven until the identity-enabled candidate is deployed.
- The archive branch/tag is local until intentionally pushed; local cleanup must preserve these refs.
- Secrets, environment files, accounts, runtime rows, queues, media, volumes, and debug artifacts must never enter Git or be synchronized as code.
- The package audit reports eight high-severity transitive advisories; do not run npm audit fix --force during this release.

## History

Detailed earlier evidence remains under .trellis/spec/fluxpost/archive/ and the latest bounded handoff/progress marker blocks.
