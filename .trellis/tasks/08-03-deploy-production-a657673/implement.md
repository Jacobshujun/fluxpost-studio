# Deployment Plan

1. Confirm the local HEAD and GitHub remote branch both resolve to `a65767384c1b1993c95c8c32d053edcd10c3fac6`; leave unrelated untracked files untouched.
2. Run the documented deterministic baseline with `TRELLIS_SMOKE_PORT=45678`. Stop on any failure.
3. Connect to production 38 with strict host-key checking and run the installed verifier check mode, then the isolated candidate verifier for the exact SHA. Require a commit-bound passing manifest.
4. Run read-only production preflight and capture non-secret evidence: active release/manifest/image, app/PostgreSQL, loopback and public HTTPS, Nginx, Open WebUI/protected services, disk headroom, current releases, named volumes, and active FluxPost workflow/provider queues. Stop if any state is unhealthy or ambiguous.
5. Create a timestamped root-only custom-format PostgreSQL backup on the VPS and verify it is non-empty without printing or transferring its contents.
6. Run the installed deploy wrapper check mode for the exact SHA, then deploy that SHA. Wait for its build, activation, health, and automatic-rollback result.
7. Verify the active release manifest, immutable image, and running container match the exact SHA. Verify app/PostgreSQL, loopback `/api/config`, public HTTPS, Nginx, Open WebUI/protected services, retained prior release, named-volume stability, expected schema, and enabled background workers.
8. Verify `/canvas`, `/copy-library`, `/library`, and `/original` return 200 and representative unsigned protected APIs return 401, without invoking paid providers or writes.
9. If a required post-check fails, run manifest-aware rollback to the captured release and verify original manifest/image, app/PostgreSQL, Nginx/public HTTPS, protected services, and volumes. Otherwise record the new production release identity.
10. Run the Trellis completion baseline if task metadata changed after the initial baseline, update `status.md` and feature evidence only where the deployment changed confirmed state, then complete task bookkeeping without including unrelated files.

## Validation Commands

```powershell
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
git ls-remote origin refs/heads/release/production-20260803
```

```bash
/opt/fluxpost-studio/bin/verify-candidate.sh --check --ref a65767384c1b1993c95c8c32d053edcd10c3fac6
/opt/fluxpost-studio/bin/verify-candidate.sh --ref a65767384c1b1993c95c8c32d053edcd10c3fac6
/opt/fluxpost-studio/bin/deploy.sh --check --ref a65767384c1b1993c95c8c32d053edcd10c3fac6
/opt/fluxpost-studio/bin/deploy.sh --ref a65767384c1b1993c95c8c32d053edcd10c3fac6
```

Production preflight, backup, and post-check commands will use the existing release manifest, Compose project, PostgreSQL container, Nginx/systemd, Docker labels, and public URLs. They must not source or print `env.production`.

## Stop Conditions

- Remote SHA differs from the approved SHA, or the exact commit cannot be fetched.
- Baseline or isolated verifier fails, lacks a commit-bound passing manifest, or operation lock is busy.
- SSH host identity, current release/image, health, protected services, disk capacity, volume inventory, active-work state, or backup is unhealthy or ambiguous.
- Deployment would require bootstrap, secret access, manual source edits, DNS/Nginx/firewall changes, global Docker operations, or volume deletion/replacement.

## Rollback Point

Capture the current production release id before activation. On post-activation failure, run `/opt/fluxpost-studio/bin/deploy.sh --rollback <captured-release-id>` and verify recovery. Never delete releases or volumes to force rollback.

## Outcome

- Deployed SHA: `a65767384c1b1993c95c8c32d053edcd10c3fac6`.
- Production release: `20260803-075434-a65767384c1b`.
- Rollback release retained: `20260729-061224-d05caddb1787`.
- Root-only backup: `pre-a65767384c1b-20260803T075421Z.dump`, non-empty custom-format archive validated before activation.
- Verified: manifest/image/container identity, healthy app/PostgreSQL with zero restarts, loopback and public HTTP, Nginx, unchanged healthy Open WebUI, four public routes, four unsigned API boundaries, ten required tables, enabled workers, zero active queues, six preserved named volumes, retained prior release, and zero fatal app-log signals.
- No rollback was required. No provider, Feishu/Lark write, runtime-data import, DNS/Nginx/firewall change, global Docker prune, or volume deletion occurred.
