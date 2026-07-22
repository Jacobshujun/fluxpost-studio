# Rebuild 104 staging from production commit

## Goal

Rebuild the FluxPost deployment on `104.243.21.233` as an isolated staging environment using the exact Git commit currently running on production `82.158.226.10`, without changing `x-ui`, `xray`, or `frps`.

## Requirements

- Resolve the full commit SHA actually running on production and require its release, container, and GitHub evidence to agree before destructive work begins.
- Add fixed-ref deployment support while preserving the current default branch workflow.
- Tag application images per commit, persist a release manifest, and support accurate automatic/manual rollback.
- Delete only the old FluxPost Compose project, its explicitly verified volumes/network, and `/opt/fluxpost-studio` on 104. Do not use global prune, restart Docker, modify firewall/DNS, or stop unrelated processes.
- Rebuild 104 with new PostgreSQL, config, account, media, and node-home state. Do not copy production secrets, runtime data, media, or volumes.
- Keep staging private on `127.0.0.1:3101` with Caddy disabled and SSH-tunnel access.
- Keep Feishu, TOS, notifications, and paid providers isolated from production targets.
- Promote future releases by the complete commit SHA approved on staging.

## Acceptance Criteria

- [x] Deployment/bootstrap scripts accept a branch, tag, or commit ref and record the resolved full SHA.
- [x] Each release records its image tag and commit, and failed deployment restores the prior release/image.
- [x] Deterministic checks cover fixed refs, private staging, rollback, shell syntax, and destructive-command guards.
- [x] Local lint, type-check, build, and full Trellis baseline pass.
- [ ] Production release, running container, and GitHub resolve to the same SHA before 104 is changed.
- [ ] 104 contains a fresh private FluxPost deployment at the production SHA with new isolated volumes.
- [ ] `x-ui`, `xray`, and `frps` process/container identity, listeners, and health remain unchanged across the rebuild.
- [ ] Staging does not contain or target production Feishu, TOS, database, account, or media state.

## Notes

- The user explicitly authorized permanent deletion of the existing FluxPost data/config/media/account state on 104.
- Production remains `82.158.226.10`; 104 is staging only.
