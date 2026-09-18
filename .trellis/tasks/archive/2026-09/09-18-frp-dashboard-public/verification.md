# FRP public dashboard verification

Date: 2026-09-18

- Public management entry: https://flux.lightmoment.net:6443/ (redirects to /static/). Independent Nginx site /etc/nginx/sites-available/frp-dashboard is enabled; listens only on public IPv4 38.76.210.136:6443 and proxies to existing 127.0.0.1:6443 FRP dashboard.
- Existing trusted hostname certificate verified with normal TLS validation; expiry 2026-12-13 UTC. Existing Certbot renewal uses nginx authenticator and installer, so the shared certificate remains under its existing renewal/reload integration. No certificate or DNS change.
- Added only UFW TCP 6443 for this entry. Dashboard backend and SSH tunnel compatibility remain unchanged.
- Public unauthenticated and invalid-password API calls returned 401. Valid credentials returned 200 for server info (FRP 0.71.0), dashboard HTML, both referenced JS/CSS assets and TCP proxy inventory. fluxpost-local proxy reports online.
- Existing credentials remain unchanged in restricted local %LOCALAPPDATA%/FluxPostStudio/frp-vps-38/dashboard-credentials.json; its URL now points at the public HTTPS entry, with the SSH address retained separately. No credentials printed or committed.
- All five original containers retained IDs, images, start timestamps and running states. Nginx master and FRP process identities remained unchanged. Hashes of all original Nginx configuration files remain unchanged. Production HTTPS full-SHA identity and local application relay remain healthy.
- Nginx syntax validation and graceful reload passed. Full project baseline passed: deterministic checks, lint, TypeScript, build, isolated HTTP smoke and SQLite. Ignored evidence log: test-artifacts/frp-dashboard-public-baseline.log.
- No live provider call, publishing action, production application deployment or account mutation.

## Rollback

Remove only /etc/nginx/sites-enabled/frp-dashboard and /etc/nginx/sites-available/frp-dashboard, validate Nginx, gracefully reload it, and remove only the newly added UFW 6443/tcp rule. Original loopback dashboard and optional SSH tunnel remain usable. Protected-state baseline is local dashboard-public-before.json under the restricted deployment directory.
