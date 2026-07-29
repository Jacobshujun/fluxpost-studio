# Production Release Execution Plan

## Integration

- [x] Refresh remote refs and assert `origin/main` still matches the planned base and is an ancestor of `d05cadd`.
- [x] Create an isolated release worktree and dedicated branch from `d05cadd`; leave root `main` and all root working-tree files unchanged.
- [x] Port the member upload queue-id source/check hunks without stale status metadata.
- [x] Port only the shared-library task's owned source, styles, helper modules, and focused checks; preserve legacy-material migration, remote library contracts, and unrelated image/tag behavior.
- [x] Add this release task and only stable spec facts needed by the candidate.
- [x] Review `git diff --check`, changed paths, ignored files, staged files, and object sizes; map every candidate path to an approved requirement.

## Candidate Verification

- [x] Run the focused library-assets, copy-library, Canvas, and VPS deployment checks.
- [x] Run `npx --no-install tsc --noEmit`, `npm run lint`, and `npm run build`.
- [x] Run mocked desktop/mobile library browser verification without external services.
- [ ] Commit the complete candidate, record its full SHA, and ensure the candidate worktree is clean.
- [ ] Run the full baseline from `.trellis/spec/fluxpost/verification.md` against that exact committed SHA. Any content edit creates a new SHA and restarts this gate.

## Remote Candidate And Approval

- [ ] Push the dedicated candidate branch and verify `git ls-remote` equals the locally verified full SHA.
- [ ] Run read-only production preflight for release identity, app/PostgreSQL, loopback 3101, public HTTPS/Nginx, workers, named volumes, rollback release, and protected unrelated services without printing secrets.
- [ ] Present candidate inventory, full SHA, verification results, residual risks, current production identity, and rollback release to the user.
- [ ] Obtain explicit approval for the evidenced full SHA before production mutation.

## Deployment And Main Convergence

- [ ] Deploy with `/opt/fluxpost-studio/bin/deploy.sh --ref <approved-full-sha>` only.
- [ ] Verify deployed identity, app/PostgreSQL, `/library`, `/copy-library`, `/canvas`, unsigned API auth, required tables/workers, named volumes, loopback/public HTTPS, Nginx, rollback retention, and protected services.
- [ ] On any failed post-deploy gate, roll back to the captured release and verify restoration; do not update GitHub `main`.
- [ ] Re-fetch `origin/main`, prove it remains an ancestor of the deployed candidate, then fast-forward GitHub `main` without force-push.
- [ ] Confirm remote `main` contains the deployed SHA, update final Trellis evidence, validate the task, and finish the task workflow.

## Stop Conditions

- Candidate scope cannot be separated from excluded dirty changes without behavioral certainty.
- A secret, runtime artifact, generated media, or debug object is staged.
- Any deterministic baseline, build, browser, preflight, or post-deploy gate fails.
- The remote base moves or a non-fast-forward update would be required.
- Production rollback identity or protected-service health cannot be confirmed.
