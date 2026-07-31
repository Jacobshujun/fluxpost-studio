# Retirement Evidence

Date: 2026-07-23

## 104 Preflight

- SSH used the pinned known-host identity and an existing dedicated key; no password or secret was printed.
- Verified exactly three Compose project `fluxpost` containers: app, PostgreSQL, and Caddy proxy.
- Verified exactly one `fluxpost_default` network, eight labeled `fluxpost_*` volumes, and six `fluxpost-app:*` image tags.
- Verified `/opt/fluxpost-studio` as a real root-owned directory without nested mounts and `/root/fluxpost-staging-credentials` as a real mode-0600 file without reading it.
- Locked protected process identities: `frps` PID 8552, `x-ui` PID 2156647, and child `xray` PID 2156673, including executable paths and listeners.
- No unrelated Docker containers existed; all non-Docker listeners were captured for exact comparison.

## 104 Retirement Result

- Removed the three FluxPost containers, one network, eight volumes, six application image tags, application root, staging credential, and Compose-owned Caddy site.
- Independent post-check found zero Compose project resources, zero `fluxpost-app:*` tags, no application/credential paths, and no listeners on 80, 443, or 3101.
- `frps`, `x-ui`, `xray`, SSH, and every unrelated non-Docker listener remained unchanged.
- Root filesystem use fell from 86% to 72% (available space 2.6 GB to 5.1 GB).
- `bbs.vollov1.xyz` still resolves to 104, but HTTPS connection now fails; external DNS deletion remains outside this server task.

## 38 Read-Only Verification

- Release: `20260723-113938-542cbb5e2d1f`.
- Manifest/repository/image commit: `542cbb5e2d1f49539393a7d51a798b7e9e0ff18f`.
- FluxPost app and PostgreSQL are running and healthy; app remains on loopback port 3101.
- Nginx is active and valid; local SNI verification and external `https://flux.lightmoment.net/api/config` return HTTP 200.
- Open WebUI remains running and healthy.
- No deployment or runtime-data mutation was performed on 38.

## Local Verification

- Git Bash syntax checks passed for `retire-104.sh`, `verify-retired-104.sh`, and `verify-38.sh`.
- `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` passed with `TRELLIS_SMOKE_PORT=45678`.
- Baseline warnings were pre-existing/non-blocking: one ESLint warning in a `.tmp-remote-first-workflow` archive, Turbopack broad filesystem tracing warnings, and expected invalid-HEIF diagnostic output.
