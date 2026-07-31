# Retire 104 staging and use 38 directly

## Goal

Remove the FluxPost staging deployment from `104.243.21.233` and make local Windows plus `38.76.210.136` the only supported bug-fix and deployment path. The 104 host itself and its unrelated services must remain intact.

## Background

- `104.243.21.233` currently runs an isolated FluxPost Compose project and Caddy site for `bbs.vollov1.xyz` alongside operator-managed `x-ui`, `xray`, and `frps` services.
- `38.76.210.136` is the current remote FluxPost environment. `82.158.226.10` is retired.
- The user explicitly authorized permanent removal of the 104 FluxPost environment and requested that future fixes deploy directly to 38 without a 104 staging gate.

## Requirements

- Inventory 104 immediately before deletion and identify FluxPost resources by exact Compose labels, container names, volume names, network names, filesystem root, listeners, and Caddy ownership.
- Capture the identity and health of `x-ui`, `xray`, and `frps` before deletion, then require the same protected services and listeners to remain healthy afterward.
- Permanently remove only the FluxPost Compose containers, FluxPost-owned network, named volumes and application image tags, `/opt/fluxpost-studio`, `/root/fluxpost-staging-credentials`, and the FluxPost Caddy site/configuration on 104.
- Do not run global Docker prune, restart Docker, change firewall/SSH, delete the VPS, or alter unrelated processes, containers, files, domains, or data.
- Verify that the 104 FluxPost loopback app port and public staging URL no longer serve the application.
- Verify 38's current FluxPost release identity, app/PostgreSQL health, loopback/public HTTP, Nginx, and unrelated protected service health without deploying new application code.
- Update the active Trellis deployment facts and decisions so future bug fixes are verified locally and deployed directly to 38; 104 must not remain a promotion or testing prerequisite.
- Do not read, print, copy, or persist remote secrets or runtime user data.

## Acceptance Criteria

- [x] A pre-delete inventory proves the exact 104 FluxPost resource set and protected-service baseline.
- [x] All confirmed FluxPost containers, named volumes, network, application image tags, application root, staging credential file, and Caddy site are absent from 104.
- [x] No process is listening on the former FluxPost loopback app port and `https://bbs.vollov1.xyz` no longer serves FluxPost.
- [x] `x-ui`, `xray`, and `frps` retain their expected executable identity and remain healthy; unrelated Docker containers and listeners remain present.
- [x] 38 remains healthy and unchanged, with release/container/manifest identity recorded without exposing secrets.
- [x] Trellis status, project brief, decisions, architecture rules, pitfalls, feature state, and verification guidance no longer describe 104 as an active staging gate.
- [x] The project baseline verification passes after documentation/state updates.

## Out Of Scope

- Deleting or cancelling the 104 VPS itself.
- Migrating 104 state, accounts, secrets, media, databases, or certificates to 38.
- Deploying new application code or triggering paid/external production workflows on 38.
- Changing DNS records outside the server; DNS cleanup may remain an operator follow-up if it is not controlled by the VPS.
