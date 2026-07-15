# Handoff

Last updated: 2026-07-01

This file is an on-demand history library. Do not read it during default startup; read the latest marker block only when recent cross-session history is needed.

## 最近一条
<!-- TRELLIS-LATEST-START -->
2026-07-15 one-command Ubuntu VPS deployment implementation is repository-complete and awaiting a real clean-host review.

Implemented:
- `scripts/deploy/vps-bootstrap.sh` prepares a fresh Ubuntu 24.04/2 GB+ host, installs official Docker/Compose, generates database/setup secrets, writes mode-0600 base config, and deploys from GitHub.
- Pre-domain mode starts only app/PostgreSQL on loopback for SSH-tunnel access. `vps-enable-domain.sh` validates resolvable DNS, enables Caddy, and checks HTTPS.
- `vps-deploy.sh --check` reports private/HTTPS service plans without GitHub, Docker, or service mutation. Legacy environments retain proxy-on, `bbs.vollov1.xyz`, and port 3101 defaults.
- Named volumes remain the persistence boundary; install/update/domain/rollback paths never use `docker compose down -v` and never modify SSH/firewall/DNS.

Verification:
- Focused deployment contract, Bash syntax, Compose YAML parsing, private/HTTPS/legacy plan execution, advanced-config regression, type-check, lint, build, and full Trellis baseline passed.
- No live second VPS, Docker daemon, DNS, certificate, GitHub, or paid provider action occurred during verification.

Operational next:
- Follow `docs/deployment/ubuntu-docker.md` on the new VPS. Keep feature `one-command-vps-deployment` at `ready_for_review` until one clean install plus later domain/HTTPS enablement is observed.
<!-- TRELLIS-LATEST-END -->

## 历史记录

- Full pre-migration handoff preserved at `.trellis/spec/fluxpost/archive/handoff-history-2026-06-17.md`.
- Use heading, date, keyword, or feature id search before opening long archive sections.
