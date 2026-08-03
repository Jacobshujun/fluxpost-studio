# Deployment Design

## Boundary

This is a fixed-SHA promotion to the existing production layout. No application code, deployment script, production configuration, proxy rule, or volume topology is changed outside the content already present in the approved commit.

The supported flow is local verification -> isolated candidate verification on production -> read-only production preflight -> root-only database backup -> installed wrapper activation -> post-deploy verification. The shared VPS operation lock serializes candidate verification and deployment.

## Release Contract

- Source identity: GitHub commit `a65767384c1b1993c95c8c32d053edcd10c3fac6`.
- Target: only `root@38.76.210.136`.
- Verification entry: `/opt/fluxpost-studio/bin/verify-candidate.sh --ref <sha>`.
- Activation entry: `/opt/fluxpost-studio/bin/deploy.sh --ref <sha>`.
- Rollback entry: `/opt/fluxpost-studio/bin/deploy.sh --rollback <captured-release-id>`.
- Runtime: existing Compose project, app on loopback port 3101, host Nginx for public HTTPS, persistent named volumes unchanged.

## Data And Service Safety

The candidate is built from a clean Git archive and receives production configuration only through the existing root-owned environment symlink at activation. The verifier must not read that environment, mount runtime volumes, or activate services.

Before activation, capture the current manifest, image/container identity, service health, protected-service identity, named-volume list, and release id. Create a timestamped root-only PostgreSQL custom-format backup in a server-local protected location and verify non-zero size. Do not download or inspect its contents.

Deployment must not proceed if health, identity, disk capacity, queue activity, or backup success is ambiguous. It must never use `docker compose down -v`, a global prune, bootstrap, or ad hoc source edits.

## Failure Handling

- Local baseline, remote candidate verification, preflight, active-work gate, or backup failure: stop with production unchanged.
- Activation health failure: the wrapper restores the captured release/image automatically; verify recovery before reporting failure.
- Post-deploy identity, route, schema, worker, volume, Nginx, HTTPS, PostgreSQL, app, or protected-service failure: invoke manifest-aware rollback to the captured release and verify the original state.
- Rollback failure or ambiguous service identity: stop further mutation and report the exact non-secret state for operator intervention.

## Verification Shape

Verification is read-only except for the isolated verifier artifacts, server-local backup, release activation, and a possible rollback. It checks exact commit/image identity, HTTP status codes, health state, schema presence, worker configuration, retained releases, named-volume stability, and protected services. It does not submit provider tasks, authenticate as a user, write Feishu/Lark records, or mutate application rows.
