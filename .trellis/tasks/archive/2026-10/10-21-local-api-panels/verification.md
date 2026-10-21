# Local Windows deployment evidence — 2026-10-21

User selected installation on this Windows computer, not a remote server.

- WorkBuddy2API Panel v1.13.0: official `linguo2625469/workbuddy2api-panel` Windows amd64 release ZIP; published checksums verified. ZIP SHA-256: `3e7a2bc9ea92246103de7777d59fe1f3351ada5bfa979f90dabf25bcc941eaa8`.
- Magpie v0.1.1307: official `yetone/magpie-releases` CLI Windows amd64 binary; published SHA256SUMS verified. Binary SHA-256: `320e97f6b18d45c6457898790b2916dfe542d484996611bf704b07cd9c2a5430`. Version command confirms 0.1.1307.
- Applications live outside the repository in `D:/Apps/workbuddy2api-panel` and `D:/Apps/magpie`. Magpie uses its upstream default persistent profile under the current user's `.config/magpie`. No provider accounts were added and no generation requests were sent.
- Loopback listeners: WorkBuddy 8080; Magpie web 3430 and API gateway 3425. The existing FluxPost PID 48892 on port 3001 was preserved.
- Scheduled tasks `WorkBuddy2API-Panel-Local` and `Magpie-Local-Web` are Running. Both use hidden PowerShell launch scripts, current-user logon triggers, no execution time limit, and native restart-on-failure settings. No restart of Windows was performed.
- WorkBuddy `/panel/` returns HTTP 200. `/status` without key returns 401; valid-key status returns 200 with zero accounts. `/healthz` returns the upstream-documented 503 with service identity and zero accounts, pending the user's login.
- Magpie web without key returns 401. Its private local shortcut exchanges the persistent web key for a cookie; authenticated browser page returns 200 and removes the key from the address. `magpie healthcheck` exits 0.
- Playwright Chromium verified both rendered management pages, empty/unconfigured state, and no JavaScript page errors. Local screenshots: `test-artifacts/local-api-panels/`; these are runtime artifacts and must not be committed.
- Desktop entries: `WorkBuddy Panel`, `WorkBuddy Access Key`, `Magpie`. Credentials and the authenticated Magpie shortcut remain local and are not recorded here.
- Existing FluxPost deterministic baseline was run with TRELLIS_SMOKE_PORT=45678. Domain checks passed; it stopped at the already documented 17 lint errors (34 total issues including warnings). No FluxPost application code was changed.

The upstream WorkBuddy README currently announces end of maintenance on 2026-10-21. Actual account/upstream service availability remains for the user's own login and configuration.
