# FRP dashboard verification

Date: 2026-09-18

- VPS FRP dashboard now binds only 127.0.0.1:6443 and uses an independent generated username/password. Server config validation and controlled restart passed. Previous config is retained as restricted `/etc/frp/frps.before-dashboard.toml`.
- Local SSH process forwards 127.0.0.1:16443 to VPS loopback 6443, with pinned known-host checking, key authentication, forward-failure exit and keepalives. It was started hidden and is active for this Windows session; it is not configured for boot startup.
- Management URL: http://127.0.0.1:16443/. Credentials: restricted local `%LOCALAPPDATA%/FluxPostStudio/frp-vps-38/dashboard-credentials.json`; never copied into Git or printed.
- Dashboard API rejected unauthenticated access with HTTP 401; authenticated access returned HTTP 200 and FRP version 0.71.0.
- Local candidate and public relay identities remain identical; original production HTTPS version is unchanged.
- Desktop launcher and credential shortcut creation were blocked by automatic approval review (`blocked by policy`, no detailed reason). Neither shortcut was installed; the core requested address and credentials are available directly.
- Full baseline passed (deterministic checks, lint, TypeScript, build, isolated HTTP smoke and SQLite); ignored log: `test-artifacts/frp-dashboard-baseline.log`.
- No new UFW rule, Nginx change, paid provider call or publishing action.
