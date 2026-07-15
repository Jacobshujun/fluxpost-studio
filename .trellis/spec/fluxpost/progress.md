# Progress

Last updated: 2026-07-01

This file is an on-demand history library. Current state belongs in `.trellis/spec/fluxpost/status.md`; routine conversation logs should not be appended here.

## 最近一条
<!-- TRELLIS-LATEST-START -->
2026-07-15 Ubuntu VPS bootstrap work:

Done:
- Parameterized the loopback app port and Caddy hostname without breaking the existing VPS defaults.
- Added root-only Ubuntu bootstrap, private pre-domain mode, persistent random base secrets, domain/HTTPS enablement, installed wrapper refresh, and read-only deployment plan output.
- Added beginner instructions for one-paste install, Windows SSH tunnel, first-admin setup, advanced configuration, DNS enablement, updates, diagnostics, persistent data, and private/HTTPS rollback.
- Added deterministic baseline coverage for Compose structure, all named volumes, Bash syntax, private/HTTPS/legacy plan behavior, root/Ubuntu/Docker/secret contracts, hostname/DNS guards, and prohibited destructive/SSH/firewall commands.
- Full Trellis baseline passed with the existing class of Turbopack path-tracing warnings.

Next:
- Run one intentional fresh Ubuntu 24.04 installation when target SSH access is available, then enable a real DNS hostname and verify HTTPS before changing the feature from `ready_for_review` to `done`.
<!-- TRELLIS-LATEST-END -->

## 历史记录

- Full pre-migration progress preserved at `.trellis/spec/fluxpost/archive/progress-history-2026-06-17.md`.
- Full previous verification log preserved at `.trellis/spec/fluxpost/archive/verification-history.md`.
- Full previous feature evidence preserved at `.trellis/spec/fluxpost/archive/feature-list-history-2026-06-17.json`.
