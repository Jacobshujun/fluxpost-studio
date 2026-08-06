# Production Docker retention and cleanup design

## Boundary

Keep the existing GitHub-driven Ubuntu deployment architecture. `scripts/deploy/vps-deploy.sh` remains the single mutation entry point for release activation, rollback, image retention, and installation of host maintenance policy. No second deployment layout, Docker daemon restart, global prune command, or direct storage-path manipulation is introduced.

`scripts/deploy/vps-verify-candidate.sh` continues to build and retain a commit-tagged verification image as evidence. It does not clean on success or failure. A later successful normal deploy owns cleanup.

## Image cleanup contract

Extend the deploy wrapper with `--cleanup-images`. Combined with `--check`, it performs a read-only preview; without `--check`, it applies the policy. This manual action validates `COMPOSE_PROJECT_NAME`, requires Docker, creates the existing app operation lock, and does not require production environment values or touch services.

The same internal cleanup function runs once after a normal deployment has passed local/public health checks and `/opt/fluxpost-studio/current` points to the new release. It does not run from build, activation-failure, automatic-rollback, or manual-rollback paths.

Selection uses Docker-provided repository, tag, image-id, and all-container image references:

- Verification repository: `${PROJECT_NAME}-verification`. Remove every tag whose image id is not referenced by any running or stopped container.
- App repository: `${PROJECT_NAME}-app`. Keep `latest`, keep the newest two `rescue-*` tags ranked by Docker image creation time, and protect every tag whose image id is referenced by a container. Remove other timestamped or legacy rescue tags and exact 40-hex immutable commit tags. Manual rollback already rebuilds a missing immutable tag from its retained release directory.
- Never remove unrecognized app tags, dangling/global images, containers, networks, or volumes.
- Invoke `docker image rm <validated repository:tag>` without `--force`. Docker remains the storage/snapshot owner.

Preview and apply print stable `keep`, `skip_referenced`, `would_remove`, or `removed` records. An individual unexpected removal failure is reported and makes the maintenance action fail.

## Post-activation failure semantics

A health-check failure follows the existing automatic rollback and exits before cleanup. After health succeeds and `current` switches, the release is committed. If image cleanup or timer installation then fails, do not roll back the healthy app: report that the release is active but maintenance failed and return nonzero so the operator cannot miss the incomplete retention policy.

## BuildKit schedule

After successful normal activation or an applied standalone image cleanup, install root-owned systemd units. A standalone cleanup preview remains non-mutating:

- `fluxpost-builder-prune.service`: one-shot `/usr/bin/docker builder prune -af --filter until=168h`.
- `fluxpost-builder-prune.timer`: weekly, persistent, enabled immediately.

The timer does not run an immediate prune during deployment. Its next scheduled run can reclaim unused BuildKit cache older than seven days; the documented manual command is available when an operator explicitly wants immediate cache cleanup. No volume or general Docker prune command is present.

The unit content is owned by the versioned deploy wrapper so current Ubuntu 22.04 production can receive it through a normal exact-SHA deploy without rerunning the Ubuntu-24-only full bootstrap. Fresh bootstrap reaches the same installation through its final standard deploy call.

## Compatibility and rollback

- Bump the deploy wrapper version so deploying an older application commit cannot downgrade the retention-aware installed wrapper.
- Preserve existing release-directory retention (`KEEP_RELEASES=3` by default), release manifests, current immutable app identity, automatic rollback, and manifest-aware manual rollback with its existing rebuild-on-missing-image path.
- A referenced old rescue tag is a deliberate safety exception to the two-tag target. Removing the referring container allows the next cleanup to enforce the target.
- Rollback of this code removes automatic cleanup and the management CLI from future wrappers; existing systemd units must be disabled/removed explicitly if the maintenance policy itself is intentionally retired.

## Verification design

Extend `.trellis/verification/vps_deployment_check.mjs` rather than adding a separate harness. Its fake Docker fixture will prove selection, dry-run immutability, apply behavior, reference protection, success-only invocation, failure-path omission, exact scoped BuildKit command, lock use, and forbidden-command guards. Existing bash syntax, exact-ref, rollback, verifier, TypeScript, lint, build, and full offline baseline remain required.
