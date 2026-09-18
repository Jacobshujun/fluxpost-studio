# FRP VPS 38 deployment verification

Date: 2026-09-18

## Installed result
- Official upstream FRP 0.71.0 Linux amd64 release, SHA-256 `84f27e39f11169f7adcef8e8b70c9329de17747b1f14dad9fb95eef5682ea716`, verified before extraction/install.
- VPS 38.76.210.136: versioned binary under `/usr/local/lib/frp/0.71.0`; dedicated unprivileged `frp` account; enabled and active `frps.service`; restricted root:frp configuration/private key (0640) under `/etc/frp`.
- Only control TCP 5443 and proxy TCP 8008 added to UFW. FRP allows only remote proxy port 8008. No dashboard, KCP, virtual-host service or Nginx change.
- New independent authentication token plus TLS forced at the server. Client verifies the server using the copied certificate and server IP. Server certificate expires 2029-09-17 UTC; renew it and update the client's trust file before expiry.
- Local renamed client `D:/frp_0.71.0_windows_amd64/feishu.exe` reads the updated existing `frpc.toml`, forwarding public 8008 to local 127.0.0.1:3001. `loginFailExit=false` permits recovery while the relay is temporarily unavailable.
- Existing desktop public shortcut now opens `http://38.76.210.136:8008/`. Browser transport remains HTTP; the encrypted FRP transport does not provide browser HTTPS.

## Verification
- Server and client configuration validation passed.
- Public root HTTP 200; public and server-loopback `/api/version` both match local candidate `2f2344a3fc1cdac5b114b918f428474af14ff62f`.
- Controlled FRP service restart passed; existing local client reconnected without replacing its process. Repeated desktop launcher preserved one client and succeeded.
- All five pre-existing container IDs, image IDs, start timestamps and running states were unchanged. Nginx master PID and production full SHA `12982377aaa8a5dcbb2c31d711c24672af7e7e43` were unchanged. Existing production HTTPS identity endpoint passed.
- Service runs as `frp`; only 5443 and 8008 FRP listeners exist; dashboard 6443 and virtual-host HTTPS 4433 remain absent.
- Full baseline passed: deterministic checks, lint, TypeScript, build, isolated HTTP smoke and SQLite. Ignored log: `test-artifacts/frp-vps-38-baseline.log`.
- No paid provider calls, publish actions, account changes, production app deployment or machine reboot. Systemd enablement verified; physical reboot was not exercised.

## Recovery
- Local rollback files are in restricted `%LOCALAPPDATA%/FluxPostStudio/frp-vps-38/`: original client configuration and launcher. Deployment credentials remain only in local/server restricted configuration, never Trellis.
- Restore both original files after stopping only the exact client executable, then launch the desktop shortcut to return to the old relay. Old VPS service and DNS remain unchanged.
- Server rollback: stop/disable `frps.service`, then remove only UFW `5443/tcp` and `8008/tcp` rules added by this task. Existing SSH and HTTP/HTTPS rules remain.
- The PC must stay on and the desktop client must run. This task enables VPS service boot startup; it does not add Windows boot startup.

## HTTPS follow-up (2026-09-18)

- User requested a certificate and automatic renewal for ximage.lightmoment.net, whose DNS A record resolves directly to VPS 38.
- New isolated Nginx site `/etc/nginx/sites-available/ximage-frp` proxies HTTPS port 443 to `127.0.0.1:8008`. HTTP port 80 redirects to HTTPS except the dedicated ACME webroot `/var/www/letsencrypt-ximage`. Existing ports and sites are unchanged.
- Dedicated Let's Encrypt certificate issued under `/etc/letsencrypt/live/ximage.lightmoment.net`, expires 2026-12-17 05:34:45 UTC. `certbot renew --cert-name ximage.lightmoment.net --dry-run --no-random-sleep-on-renew --non-interactive` passed.
- Existing certbot.timer is enabled/active. Existing executable deploy hook `20-reload-nginx-after-renewal` validates and reloads Nginx; separately exercised successfully. Renewal uses the VPS webroot, so the local computer is not needed for certificate renewal.
- Proxy preserves Host and HTTPS scheme, existing 1 GiB upload limit and 3600-second upstream timeouts, supports WebSocket upgrades, and disables request/response buffering and proxy cache. No media cache or data migration was introduced.
- Public TLS hostname verification, HTTP redirect with path/query, page and JS/CSS assets, byte-range 206 response, account-state endpoint and exact local candidate identity passed. No real user login/upload, paid provider call or publishing action was performed.
- Desktop public launcher now opens `https://ximage.lightmoment.net/`; syntax and real `-NoBrowser -NoPause` execution passed, reusing the existing client. Prior launcher retained locally as `launcher.before-ximage-https.ps1` under the restricted deployment directory.
- Original Nginx configuration hashes, all container identities/start timestamps, Nginx master and FRP PIDs remain unchanged. Production HTTPS identity and protected dashboard authentication remain healthy.
- Full project baseline passed; ignored log: `test-artifacts/ximage-https-baseline.log`. Initial combined task-artifact creation command was policy-blocked; this bounded follow-up evidence stays with the original relay deployment.
- Rollback: remove only the ximage-frp site link/config, validate and reload Nginx, and restore the local launcher backup. Original port-8008 HTTP access remains available. Retain the VPS/DNS reachability on port 80 for future automated HTTP-01 renewal.
