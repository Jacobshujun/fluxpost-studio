# Deployment Design

## Resource Boundary

The installer creates only `/opt/fluxpost-studio`, Compose project `fluxpost`, containers `fluxpost-app` and `fluxpost-postgres`, the `fluxpost_default` network, and FluxPost-prefixed named volumes. It starts only `postgres` and `app`; Caddy remains disabled because the VPS already has Nginx on ports 80 and 443.

Existing `/opt/open-webui`, Compose project `open-webui`, its container and volumes, Nginx, and unrelated systemd services are read for baseline comparison and otherwise left untouched.

## Configuration And Data

The bootstrap creates a root-only `/opt/fluxpost-studio/shared/env.production` with generated PostgreSQL and first-admin setup values. Runtime database, configuration overrides, media, generated content, node home, and future Caddy state stay in named volumes. No old VPS state is copied and no secret is placed in Git or task artifacts.

## Failure And Rollback

The installer performs local health checks after `docker compose up -d postgres app`. On failure, capture FluxPost-only logs and stop only `fluxpost-app`/`fluxpost-postgres`; preserve their volumes for diagnosis. Do not remove or restart unrelated services and do not delete volumes.

## Security

Use the explicit private key and a temporary/pinned host-key check for the recorded ED25519 identity. Suppress bootstrap output containing the one-time setup key; the operator retrieves it directly in a VPS terminal when needed.
