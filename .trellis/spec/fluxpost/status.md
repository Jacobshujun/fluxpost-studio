# FluxPost Current Status

Last updated: 2026-08-17

## One-Line Status

The deployed exact-SHA baseline remains unchanged; the Dongchedi category-page serial rewrite feature is verified and committed locally but not pushed or deployed.

## Current Focus

- Dongchedi category tasks process up to 30 current-page articles serially into review drafts; optional Cookie state stays encrypted and Feishu is disabled.
- Port 3001 is the only local application environment and runs from D:/FluxPost/social-content-studio.
- Production exposes versioned identity and preserves its PostgreSQL/config/data/media volumes and unrelated services.
- Only main plus the local WIP archive branch remain locally; merged GitHub branches and extra worktrees were removed.

## Next Entry

Start new work from current main, preview only on port 3001, commit before candidate restart, then promote the unchanged verified SHA.

## Recent Verification

- 2026-08-17: Dongchedi category guards, serial drafts, pause/resume, Cookie secrecy, full offline baseline, and unauthenticated desktop/mobile smoke passed without external calls.
- 2026-08-17: full local and isolated VPS baselines, exact-SHA deployment, identity, health, 30-table PostgreSQL schema, six unchanged FluxPost volumes, protected services, empty recent error log, two rescue tags, active weekly timer, and three-way parity passed.
- 2026-08-17: three extra worktrees and four stale records were removed; root runtime data/media/config were preserved; unique WIP is recoverable from archive/root-wip-20260817 and archive-root-wip-20260817.
- 2026-08-17: external 0814 FFmpeg batch script upgraded to smooth-beat-v2; all 18 processable outputs rebuilt with adaptive duration, non-looping audio, smooth transitions, and deterministic light motion; media and repository baselines passed.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Local builds over the large retained media tree emit known Turbopack dynamic-path tracing warnings.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
