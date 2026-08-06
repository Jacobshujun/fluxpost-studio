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

### Verify And Deploy An Approved Commit

Production promotion must verify and deploy the same complete Git commit instead of a moving branch:

```bash
sudo /opt/fluxpost-studio/bin/verify-candidate.sh --check --ref FULL_40_CHARACTER_COMMIT
sudo /opt/fluxpost-studio/bin/verify-candidate.sh --ref FULL_40_CHARACTER_COMMIT
sudo /opt/fluxpost-studio/bin/deploy.sh --check --ref FULL_40_CHARACTER_COMMIT
sudo /opt/fluxpost-studio/bin/deploy.sh --ref FULL_40_CHARACTER_COMMIT
```

The verifier builds the clean commit's isolated `verification` target without reading production configuration, mounting runtime volumes, or activating services. The deploy wrapper then fetches the same ref, resolves it to a full commit, archives that commit, tags the built app image with the commit, and writes `release.manifest` inside the release directory. A failed health check restores the previously running release and image. Omitting `--ref` retains the existing `main` branch behavior.

Do not promote by copying `current`, `env.production`, Docker volumes, or runtime media between servers. The release contains a symlink to the server-local environment file, and each server must retain its own secrets and runtime state.

### Docker Disk Retention

Deploy wrapper version 4 applies FluxPost image retention only after the new release passes all health checks and `current` points to it. It removes unused `fluxpost-verification:*` tags and unreferenced historical `fluxpost-app:<40-hex-commit>` tags, keeps `fluxpost-app:latest` plus the two newest `fluxpost-app:rescue-*` tags, and removes older unreferenced rescue tags. Images referenced by any running or stopped container are skipped. Unrecognized app tags, unrelated images, containers, networks, and named volumes are not cleanup targets. A later manifest-aware rollback rebuilds its app image from the retained release directory when its immutable tag was cleaned.

A build or health-check failure exits before retention runs, preserving its Docker evidence and BuildKit cache for diagnosis. If post-activation cleanup fails, the healthy release remains active but the deploy command returns an explicit maintenance error instead of rolling it back.

Preview the same policy without removing images:

```bash
sudo /opt/fluxpost-studio/bin/deploy.sh --cleanup-images --check
```

Apply it immediately:

```bash
sudo /opt/fluxpost-studio/bin/deploy.sh --cleanup-images
```

Both operations use the deployment/verification lock. Cleanup delegates layer and overlay snapshot reclamation to `docker image rm`; never delete files below Docker or containerd storage directories directly.

Successful deployments and an applied standalone image cleanup both install and enable `fluxpost-builder-prune.timer`. It runs weekly and removes only unused BuildKit cache older than seven days. A cleanup preview does not alter the schedule. Inspect the schedule and recent result with:

```bash
sudo systemctl list-timers fluxpost-builder-prune.timer
sudo systemctl status fluxpost-builder-prune.service
```

To run the same cache policy immediately after reviewing current Docker usage:

```bash
sudo docker system df
sudo docker builder prune -af --filter until=168h
```

Build cache cleanup does not affect running containers or named volumes; it can make the next image build slower. Do not replace these scoped commands with `docker system prune`, `docker image prune`, or `docker volume prune` on a shared host.

### Rebuild An Existing Host As Private Staging

Before removing an old FluxPost deployment from a host that runs other services:

1. Record the protected processes/containers, listeners, and health state.
2. Identify FluxPost containers, networks, and volumes through exact Compose project labels.
3. Stop and remove only the confirmed FluxPost resources and the verified `/opt/fluxpost-studio` application root.
4. Never run a global Docker prune, restart Docker, modify firewall rules, or stop a process merely because it owns a port.
5. Abort if any FluxPost-labelled resource overlaps a protected service.

Place the current `vps-bootstrap.sh`, `vps-deploy.sh`, and `vps-enable-domain.sh` together in a temporary directory when the target application commit predates the fixed-ref wrappers. Then rebuild without changing system packages or Docker. Full installation remains Ubuntu 24.04-only; `--app-only` may reuse an existing Linux host after verifying all required tools:

```bash
sudo bash /tmp/fluxpost-deploy/vps-bootstrap.sh \
  --admin-user stagingadmin \
  --ref FULL_40_CHARACTER_COMMIT \
  --app-only \
  --staging \
  --credentials-file /root/fluxpost-staging-credentials
```

`--staging` forces private mode, disables TOS initially, sets `TOS_OBJECT_PREFIX=fluxpost/staging`, and clears Feishu notification recipients. The generated administrator credentials are written with mode `0600` instead of being printed. Configure a test Feishu Base and other isolated provider credentials only after the private deployment passes its baseline checks.

On an existing low-memory host, `--app-only` may use already-enabled swap for the image build when combined RAM and swap meet the bootstrap minimum. It never creates or changes swap; a fresh system installation still requires the physical-memory minimum.

After the private baseline passes and DNS points to the host, `enable-domain.sh <hostname>` enables Caddy while pinning the redeploy to the active release manifest commit. Set `DEPLOY_REF` only when intentionally enabling the domain and promoting a different approved ref in one operation.

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

For releases created by deploy wrapper version 2, prefer the manifest-aware rollback command:

```bash
sudo /opt/fluxpost-studio/bin/deploy.sh --rollback RELEASE_ID
```

The release id has the form `YYYYMMDD-HHMMSS-<12-character-commit>`. The wrapper validates the manifest, activates its commit-tagged image, checks health, and restores the previously running release if rollback activation itself fails.
