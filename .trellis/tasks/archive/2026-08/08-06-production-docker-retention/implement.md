# Production Docker retention and cleanup implementation

## Checklist

- [x] Extend `scripts/deploy/vps-deploy.sh` with versioned cleanup, validation, locking, preview, full-id reference inventory, verification/history removal, and two-rescue retention.
- [x] Run cleanup only after health success and `current` switch; report post-activation maintenance failure without rolling back the healthy release.
- [x] Install and enable the root-owned weekly BuildKit prune service/timer from the successful normal deploy or applied standalone cleanup path.
- [x] Extend `.trellis/verification/vps_deployment_check.mjs` with fake-Docker cleanup/timer assertions and success/failure ordering checks.
- [x] Document preview/apply, automatic behavior, cache policy, rollback trade-off, and volume exclusions.
- [x] Run focused and full offline verification without production/provider/Docker mutation.
- [x] Update stable deployment rules, status, verification, pitfalls, decisions, and the owning feature entry with confirmed evidence.

## Verification evidence

- `node .trellis/verification/vps_deployment_check.mjs`: passed.
- `npx --no-install tsc --noEmit`: passed.
- `npm run lint`: passed with five pre-existing Canvas warnings and zero errors.
- Docker-mode local Next build compiled and produced `server.js`, but the dirty local context traced runtime directories; local Docker was unavailable, so clean-context Docker verification remains the candidate VPS gate.
- `$env:TRELLIS_SMOKE_PORT='45678'; powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`: passed, including build, HTTP smoke, and SQLite checks.
- Production 38: two matching dry-run previews preceded scoped cleanup; eight unused verification tags and historical app/rescue tags beyond current plus two rescue versions were removed, BuildKit reported `8.998GB` reclaimed, root usage fell from `52GB/69%` to `36GB/47%`, and five healthy containers, seven unchanged volumes, local/public health, final preview, and the active weekly timer passed.

## Verification commands

```powershell
node .trellis/verification/vps_deployment_check.mjs
npx --no-install tsc --noEmit
npm run lint
npm run build
$env:TRELLIS_SMOKE_PORT='45678'; powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

## Review gates

- The diff must contain no `.env*`, production values, runtime data, generated media, or unrelated Canvas changes.
- No command may contain `docker system prune`, `docker image prune`, `docker volume prune`, Compose `down -v`, direct `/var/lib/docker` or `/var/lib/containerd` deletion, Docker daemon restart, or forced image removal.
- Normal deploy failure must produce no image-removal or builder-prune installation command.
- Dry-run cleanup must produce no Docker mutation.
- Post-health maintenance failure must state that the release is already active and return nonzero without rollback.

## Rollback points

- Revert the deploy-wrapper and deployment-check changes together if image selection cannot be proven deterministically.
- Do not delete or recreate named volumes during implementation, verification, deployment, or rollback.
- Do not run production cleanup without a matching dry-run preview, explicit operator authorization, a verified wrapper, and post-cleanup health/volume checks.
