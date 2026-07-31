# Design

## Retirement Boundary

Treat 104 as a shared host, not as a disposable machine. Resolve the live FluxPost resource set from Docker Compose labels and exact names, then compare it with the known project-owned containers, `fluxpost_*` volumes, `fluxpost_default` network, `fluxpost-app:*` image tags, `/opt/fluxpost-studio`, `/root/fluxpost-staging-credentials`, loopback port 3101, and the Caddy site. Abort deletion if ownership overlaps `x-ui`, `xray`, `frps`, or an unidentified resource.

## Protected-Service Contract

Capture executable paths, process relationships, systemd/container state, and listener ownership for `x-ui`, its child `xray`, and `frps`. Capture unrelated Docker container identities and listeners. After FluxPost removal, compare those facts and fail the operation if a protected service changed or stopped.

## Deletion Sequence

1. Stop and remove only containers labeled for Compose project `fluxpost`.
2. Remove only the verified `fluxpost_default` network, exact FluxPost named volumes, and `fluxpost-app:*` image tags not used by unrelated containers.
3. Remove the verified `/opt/fluxpost-studio` tree and root-only staging credential file after confirming their resolved paths and types.
4. Remove the Caddy configuration with its verified Compose proxy container and Caddy volumes; do not modify host Caddy configuration because none owns this site.
5. Verify application port 3101 and public ports 80/443 no longer serve the retired Compose project, then verify the public staging endpoint no longer serves FluxPost.

No global prune, `docker compose down -v` without an exact reviewed resource set, Docker restart, firewall change, or VPS-wide cleanup is allowed.

## Direct-To-38 Workflow

Local Windows remains the development and deterministic verification environment. After a fix is approved, deploy the exact intended Git commit directly to `38.76.210.136` with the existing release wrapper, immutable image/manifest identity, health gate, and automatic rollback. 104 is removed from promotion, validation, and troubleshooting instructions.

## Rollback And Recovery

The 104 FluxPost runtime data deletion is intentionally permanent and is not restored. Before deletion, retain only non-secret inventory evidence; do not copy state or secrets. If protected-service verification fails, stop further cleanup and restore only a Caddy configuration change when necessary. The 38 environment is read-only during this task, so it requires no application rollback.

## Repository Scope

No application source or deployment script behavior should change unless inspection finds a hard-coded 104 promotion gate. Update only the active Trellis fact sources and this task's evidence. Preserve all unrelated dirty-worktree changes.
