# Design

## Deployment Contract

- `vps-deploy.sh --ref <ref>` resolves the requested ref to a full Git commit, archives that commit, builds `fluxpost-app:<sha>`, and writes a non-secret release manifest.
- `--check` remains non-mutating and reports the requested ref. `--rollback <release-id>` activates the recorded image and release without touching named volumes.
- `vps-bootstrap.sh --ref <ref> --app-only` reuses installed Linux host tooling and avoids package installation or Docker service changes. Full installation remains Ubuntu 24.04-only, and existing `--branch` behavior remains compatible.

## Activation And Rollback

- The wrapper tags Compose's canonical app image as `<project>-app:<full-sha>` after every build. Activation retags that immutable image to Compose's canonical name, which also supports older target commits whose Compose file predates this deployment contract.
- Before activation, capture the previous release/image. If the new local/public health gate fails, reactivate the previous release/image and verify local health before returning failure.
- The `current` symlink changes only after successful health checks. Manual rollback uses the same activation boundary.

## Staging Rebuild Boundary

- Inventory 104 and identify FluxPost resources by exact Compose labels/names. Abort on overlap with `x-ui`, `xray`, or `frps`.
- Remove only confirmed FluxPost containers, network, named volumes, and the verified app root. Never run global prune or restart Docker.
- Recreate FluxPost in private mode with new secrets and volumes. Production runtime/config files are never read or copied.

## Compatibility

- Default deploys continue following `BRANCH=main` when `--ref` is omitted.
- Existing production config and volume names remain unchanged.
- No application API or data-schema change is introduced.
