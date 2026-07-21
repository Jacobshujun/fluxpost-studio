# Execution Checklist

1. Verify GitHub `main` is still `a73ed01` and confirm the VPS host key fingerprint.
2. Capture read-only baseline: OS/resources, listening sockets, Docker containers/projects/networks/volumes, Open WebUI identity, Nginx, and active services.
3. Confirm `/opt/fluxpost-studio`, port `3101`, FluxPost container names, and FluxPost Compose resources are unused.
4. Download the pinned bootstrap script and run it with `--admin-user admin` and no `--domain`; redirect installer output so the setup key is not shown in the tool transcript.
5. Verify FluxPost health, private binding, project/release commit, and absence of proxy.
6. Recheck Open WebUI, Nginx listeners, unrelated sockets, and active services against the baseline.
7. If health verification fails, collect only FluxPost logs and stop only FluxPost containers while preserving volumes.
8. Run the repository baseline verification, update Trellis status/handoff with confirmed deployment evidence, then finish/archive this task without committing unrelated worktree changes.

## Commands And Gates

- Remote commands use explicit SSH identity, port, user, and host-key pinning.
- Deployment must never contain `docker compose down -v`, `docker system prune`, or broad container/network/volume cleanup.
- Acceptance requires healthy Compose services, HTTP 200 `/api/config`, loopback-only `3101`, unchanged existing application baseline, and a working SSH tunnel instruction.
