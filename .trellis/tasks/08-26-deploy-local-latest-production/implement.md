# Production Release Plan

1. Review the task artifacts, activate the Trellis task, and commit the new
   pre-release task metadata on top of `7df08cc987779478fc133b3c81a303bb8bae1f2d`.
2. Inspect the committed candidate inventory and tracked sensitive/runtime paths.
   Stop if any non-task change appeared after the approved base.
3. If the isolated Linux verifier rejects lockfile synchronization, regenerate
   only `package-lock.json` with the verifier's npm version and Linux x64 optional
   dependency metadata. Require `package.json` and resolved dependency versions
   to remain unchanged, validate npm 11.17 clean-install resolution, commit the
   repair, and restart every candidate verification and push gate on the new SHA.
4. If Debian 12 FFmpeg rejects the video rotation fixture's current option, add a
   verification-only fallback for the legacy rotate metadata syntax. The focused
   check must still observe 90-degree rotation and swapped display dimensions on
   both the local current FFmpeg and VPS FFmpeg 5.1, then restart every candidate
   verification and push gate on the new SHA.
5. If the isolated verifier reaches the Canvas subtitle UTF-8 probe without a
   Python executable, add `python3-minimal` only to the Docker verification stage,
   make the probe select `python` or `python3`, and make process-start failures
   explicit. Require the subtitle and VPS deployment contract checks to pass,
   then restart every candidate verification and push gate on the new SHA.
6. Run the deterministic baseline with `TRELLIS_SMOKE_PORT=45678`. Require every
   focused check, TypeScript, lint, production build, HTTP smoke, and database
   check to pass without external provider calls.
7. Run `npm run local`, then verify port `3001` reports candidate mode and the exact
   committed SHA.
8. Fast-forward `origin/local` and `origin/main` to the same SHA without force and
   independently verify both remote refs.
9. Run installed verifier check mode and isolated verification for the exact SHA;
   require a commit-bound passing manifest.
10. Run read-only production preflight. Capture the current release for rollback
   plus identity, app/PostgreSQL/Nginx/public health, loopback listener, protected
   services, disk, release inventory, volume mounts, worker state, logs, and all
   active queues. Stop on unhealthy, active, or ambiguous state.
11. Present the full candidate SHA, verification result, preflight result, and
   rollback release, then obtain separate explicit activation approval.
12. Create a root-only PostgreSQL custom-format backup and validate non-zero size.
13. Run deploy check mode and activate only the approved full SHA. Wait for the
    wrapper's build, switch, health, retention, and timer result.
14. Verify production SHA identity, app/PostgreSQL/Nginx/public and loopback health,
    expected public routes and unauthenticated API boundaries, schema, workers,
    logs, unchanged volume mounts/protected services, retained rollback, two rescue
    images, no stale verification tag, and the weekly BuildKit timer.
15. On a failed required post-check, roll back to the captured release and verify
    recovery. On success, run `npm run local:parity` while the candidate worktree is
    still clean.
16. Update FluxPost status and deployment evidence, archive the task, run the
    completion Trellis check, commit only completion metadata, and push that commit
    only to `origin/local`.

## Validation Commands

```powershell
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
npm run local
npm run local:parity
```

```bash
/opt/fluxpost-studio/bin/verify-candidate.sh --check --ref FULL_SHA
/opt/fluxpost-studio/bin/verify-candidate.sh --ref FULL_SHA
/opt/fluxpost-studio/bin/deploy.sh --check --ref FULL_SHA
/opt/fluxpost-studio/bin/deploy.sh --ref FULL_SHA
/opt/fluxpost-studio/bin/deploy.sh --rollback PRIOR_RELEASE_ID
```

## Stop Conditions

- Candidate inventory, full SHA, local identity, or GitHub remote refs differ.
- Any deterministic baseline or isolated verifier check fails.
- Production identity, health, disk, volume mounts, protected services, active
  queues, rollback availability, or backup result is unhealthy or ambiguous.
- Exact-SHA activation approval has not been obtained.
- The operation would require secrets, bootstrap, manual server edits, external
  writes, DNS/firewall/Nginx changes, global Docker operations, or volume changes.
