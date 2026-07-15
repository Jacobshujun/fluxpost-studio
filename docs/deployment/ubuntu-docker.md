# Ubuntu 24.04 Docker Deployment

FluxPost Studio is deployed from GitHub with Docker Compose. The supported beginner path is a fresh Ubuntu 24.04 VPS with at least 2 GB RAM.

## Before You Start

You need:

- the VPS public IP;
- root or sudo access;
- the SSH port;
- an administrator username using 2-48 lowercase letters, numbers, `.`, `_`, `@`, or `-`;
- outbound access to GitHub, Ubuntu apt repositories, Docker Hub, and Docker's apt repository.

The installer does not change SSH, UFW, cloud firewall, or DNS settings. It creates a fresh FluxPost database and does not copy data or secrets from another VPS.

## One-Paste Installation

Sign in to the new VPS, replace `myadmin` with your intended login username, and paste this command:

```bash
sudo apt-get update && sudo apt-get install -y curl && curl -fsSL https://raw.githubusercontent.com/Jacobshujun/fluxpost-studio/main/scripts/deploy/vps-bootstrap.sh -o /tmp/fluxpost-bootstrap.sh && sudo bash /tmp/fluxpost-bootstrap.sh --admin-user myadmin
```

The installer:

1. verifies Ubuntu 24.04 and available memory;
2. installs Git, curl, Docker Engine, and the Docker Compose plugin when needed;
3. creates `/opt/fluxpost-studio`;
4. generates a random PostgreSQL password and first-admin setup key;
5. stores base configuration at `/opt/fluxpost-studio/shared/env.production` with mode `0600`;
6. builds and starts PostgreSQL plus the app;
7. leaves Caddy and public ports 80/443 disabled until a domain is configured.

Record the first-admin setup key printed at the end. It is shown only for a new environment. Do not post the key in chat, commit it to GitHub, or save it in project files.

## Private Access Before You Have A Domain

The app listens only on `127.0.0.1:3101` on the VPS. It is not directly reachable from the internet.

On your Windows computer, open PowerShell and keep this command running:

```powershell
ssh -L 3101:127.0.0.1:3101 root@NEW_VPS_IP -p SSH_PORT
```

Then open:

```text
http://127.0.0.1:3101
```

Use the administrator username and the printed setup key to create the first administrator. After signing in, open the admin-only advanced configuration page and enter TikHub, OpenAI-compatible, image-provider, Feishu, and other optional values. These UI-managed overrides are stored in the persistent `fluxpost_fluxpost-config` volume.

## Enable A Domain And HTTPS Later

1. Choose a hostname such as `flux.example.com`.
2. Add its DNS `A` record pointing to the new VPS IPv4 address. Add an `AAAA` record only when IPv6 is correctly configured.
3. Ensure your provider security group/firewall allows inbound TCP 80 and 443. The FluxPost scripts do not change firewall rules.
4. Wait until the hostname resolves, then run:

```bash
sudo /opt/fluxpost-studio/bin/enable-domain.sh flux.example.com
```

The command validates DNS, persists the hostname, starts Caddy, obtains a certificate, and checks:

```text
https://flux.example.com/api/config
```

Do not include `https://`, a path, or a port in the hostname argument.

## Update To The Latest GitHub Version

After new code is pushed to GitHub `main`, run on the VPS:

```bash
sudo /opt/fluxpost-studio/bin/deploy.sh
```

The deploy wrapper fetches `main`, creates a clean release, builds the app image, starts the configured private or HTTPS service set, performs health checks, switches `/opt/fluxpost-studio/current`, and keeps the newest three releases.

Do not edit source code under `current`. Make changes locally, verify them, push GitHub, and deploy from GitHub.

## Status And Logs

Preview the deployment mode without building, restarting, or contacting external services:

```bash
sudo /opt/fluxpost-studio/bin/deploy.sh --check
```

```bash
cd /opt/fluxpost-studio/current
sudo COMPOSE_PROJECT_NAME=fluxpost docker compose --env-file deploy/env.production ps
sudo COMPOSE_PROJECT_NAME=fluxpost docker compose --env-file deploy/env.production logs -f app
```

Expected private-mode services:

- `fluxpost-app`: healthy;
- `fluxpost-postgres`: healthy;
- `fluxpost-proxy`: absent or stopped.

After enabling a domain, `fluxpost-proxy` should also be running.

## Persistent Data And Secrets

Server layout:

- `/opt/fluxpost-studio/repo`: GitHub working clone;
- `/opt/fluxpost-studio/releases/<timestamp>`: clean source releases;
- `/opt/fluxpost-studio/current`: active release symlink;
- `/opt/fluxpost-studio/shared/env.production`: root-only base environment;
- `/opt/fluxpost-studio/bin/deploy.sh`: update command;
- `/opt/fluxpost-studio/bin/enable-domain.sh`: domain/HTTPS command.

Runtime state remains in Docker named volumes, including PostgreSQL, advanced configuration, runtime files, generated/crawled media, node home, and Caddy certificate data.

Never run:

```bash
docker compose down -v
```

The `-v` flag deletes named volumes and can permanently remove the database, advanced configuration, and media.

## Rollback

List retained releases:

```bash
ls -1 /opt/fluxpost-studio/releases
```

Select a previous release, then run:

```bash
sudo ln -sfn /opt/fluxpost-studio/releases/PREVIOUS_RELEASE /opt/fluxpost-studio/current
cd /opt/fluxpost-studio/current
sudo COMPOSE_PROJECT_NAME=fluxpost docker compose --env-file deploy/env.production up -d postgres app
```

The command above preserves private mode. If HTTPS was already enabled for a working domain, start all three services instead:

```bash
sudo COMPOSE_PROJECT_NAME=fluxpost docker compose --env-file deploy/env.production up -d
```

Rollback reuses the same persistent named volumes. Do not add `-v` to any Compose command.
