# Deploy FluxPost to second VPS

## Goal

Deploy the current GitHub `main` version of FluxPost Studio to Ubuntu VPS `82.158.226.10` in private SSH-tunnel mode without interrupting its existing applications.

## Confirmed Requirements

- Connect as `root` on SSH port `22` using the configured ED25519 key.
- Pin the observed server host identity (`SHA256:pPsIj9GSFRWAvBgVkDR6EAN25msqTQ4Z1QRS/5wWCqE`) before mutating the VPS.
- Deploy commit `a73ed01` from `Jacobshujun/fluxpost-studio` `main`.
- Use first administrator username `admin`; do not print the generated initialization key or secrets in chat, task files, or repository files.
- Install under `/opt/fluxpost-studio` with Compose project `fluxpost`, app binding `127.0.0.1:3101`, and no domain/proxy service.
- Do not modify SSH, firewall, DNS, Nginx, existing reverse proxies, existing applications, unrelated Docker resources, or named volumes.
- Never execute `docker compose down -v`, Docker-wide cleanup, or image/volume pruning.

## Acceptance Criteria

- [x] `fluxpost-app` and `fluxpost-postgres` are healthy and belong to Compose project `fluxpost`.
- [x] VPS-local `http://127.0.0.1:3101/api/config` returns HTTP 200.
- [x] Port `3101` listens only on `127.0.0.1`; `fluxpost-proxy` is absent or stopped.
- [x] Existing Open WebUI container identity/health, Nginx `80/443` listeners, and pre-existing systemd services remain available.
- [x] GitHub commit, active release, Compose config, and running FluxPost containers agree on the deployed version.
- [x] SSH tunnel access is documented and no initialization secret is exposed by the deployment transcript.

## Out Of Scope

- Domain/DNS/HTTPS enablement.
- Migration of data, accounts, media, databases, or secrets from another VPS.
- Changes to the application source code.
