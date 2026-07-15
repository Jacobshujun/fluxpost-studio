# Design

## Deployment modes

`FLUXPOST_PROXY_ENABLED` controls the release startup shape. It defaults to `true` for compatibility with the existing VPS. A new bootstrap writes `false`; deploy then starts only `postgres` and `app` and ensures an old proxy container is stopped. `vps-enable-domain.sh` writes a validated `FLUXPOST_PUBLIC_HOST`, switches the flag to `true`, and reruns the release deploy so Caddy is activated.

`FLUXPOST_APP_PORT` defaults to `3101` and remains bound as `127.0.0.1:${FLUXPOST_APP_PORT}:3000`. The Caddy service remains a normal Compose service and uses `${FLUXPOST_PUBLIC_HOST:-bbs.vollov1.xyz}`. Keeping it out of a profile lets the currently installed legacy deploy wrapper consume the first upgraded release without losing proxy management; the new wrapper selects private-mode services explicitly.

## Bootstrap contract

The bootstrap runs as root on Ubuntu 24.04, accepts CLI flags, validates the admin username and paths, installs missing OS prerequisites and Docker from Docker's official apt repository, generates hex secrets with `openssl rand`, creates the standard server layout, writes the shared base environment atomically with mode 0600, installs root-owned wrapper scripts, then executes deploy.

The first-admin setup key is printed once at completion. Provider keys stay blank and are entered later through the admin UI, where they persist in `fluxpost-config`.

## Release deploy compatibility

The release script reads deployment controls from `shared/env.production` without sourcing arbitrary application values. It selects Compose services/profile explicitly, derives local/public health URLs from deployment keys unless caller overrides are supplied, and keeps the existing release archive and volume behavior. Existing installations lacking the new keys continue with HTTPS and the current domain.

## Domain enablement

The domain script validates a lowercase DNS hostname, rejects schemes/paths/ports, updates only the two deployment keys in the shared environment, runs the installed deploy wrapper, and reports DNS/80/443 prerequisites clearly if public health fails. It does not edit DNS or firewall rules.

## Verification

A no-network Node verification script checks shell syntax where Bash is available, parses the scripts and Compose source, renders deployment-mode expectations through fixtures/static contracts, ensures secret placeholders are not generated, and rejects destructive volume commands. Full Trellis baseline remains the final gate.

## Rollback

Code rollout uses the existing previous-release symlink procedure. Domain mode can be disabled by setting `FLUXPOST_PROXY_ENABLED=false` and deploying again. Named volumes are never removed.
