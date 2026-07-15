# Add one-command Ubuntu VPS deployment

## Goal

Let a beginner bootstrap a fresh Ubuntu 24.04 VPS from the public GitHub repository with one pasted command, keep the app private until a domain is ready, and retain one-command GitHub-driven updates afterward.

## Background

- The existing production deployment already uses Docker Compose, release directories, persistent named volumes, and `scripts/deploy/vps-deploy.sh`.
- `compose.yaml` and public health defaults currently assume `bbs.vollov1.xyz`.
- The target VPS has at least 2 GB RAM. It starts with no FluxPost database, accounts, media, or advanced configuration.
- Before DNS is ready, the operator will access `127.0.0.1:3101` through an SSH tunnel.

## Requirements

- Add an idempotent root-only Ubuntu 24.04 bootstrap that installs Docker Engine/Compose plugin, Git, curl, and supporting packages only when missing.
- Bootstrap must create `/opt/fluxpost-studio`, clone the configured GitHub repository, generate strong database and first-admin setup secrets, write a mode-0600 shared environment file, install deploy/domain wrappers, and invoke the existing release deployment path.
- Bootstrap must accept a required administrator username and optional repository, branch, app root, and public host inputs. External provider and Feishu values remain empty for later admin-page configuration.
- Default bootstrap mode must start only app and PostgreSQL. The app stays bound to `127.0.0.1:3101`; proxy ports 80/443 are not opened by Compose until explicitly enabled.
- Add a root-only domain command that validates a hostname, persists it in the shared environment, enables the HTTPS profile, deploys Caddy, and verifies public `/api/config` health.
- Parameterize the app loopback port and Caddy host while preserving the current production VPS behavior when new variables are absent.
- Deployment must keep PostgreSQL, advanced config, runtime data, generated media, node home, and Caddy data in named volumes across updates.
- Scripts must not modify SSH settings or firewall rules and must never use `docker compose down -v`.
- Document the one-command install, generated credential handling, Windows SSH tunnel, first-admin flow, DNS/domain enablement, updates, diagnostics, and rollback.
- Default verification must be deterministic and must not install packages, access GitHub, start Docker, change firewall/SSH, or call production providers.

## Acceptance Criteria

- [x] A single pasted bootstrap command can prepare a fresh Ubuntu 24.04 host after the operator supplies an admin username.
- [x] Pre-domain deployment selects app + PostgreSQL only, binds app to loopback, and does not publish 80/443.
- [x] Domain-enabled deployment adds Caddy with the configured hostname and 80/443 ports.
- [x] Existing environments without the new deployment keys still resolve to `bbs.vollov1.xyz`, loopback port 3101, and HTTPS enabled.
- [x] Generated database/setup credentials are non-placeholder values and the environment file is required to be mode 0600.
- [x] Re-running deploy preserves all named volume declarations and never removes volumes.
- [x] Bootstrap/domain/deploy scripts pass syntax and deterministic contract checks.
- [x] Type-check, lint, build, and the full Trellis baseline pass.
- [x] Changes are committed and pushed to GitHub `main`; no live new-VPS installation is attempted without target SSH access.

## Out Of Scope

- Migrating any old VPS database, accounts, media, Docker volumes, or secrets.
- Automatically changing DNS, SSH configuration, cloud security groups, or host firewall rules.
- Supporting non-Ubuntu distributions in the first release.
- Running paid TikHub, OpenAI, image-provider, or Feishu operations during verification.
