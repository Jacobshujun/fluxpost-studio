# FluxPost Current Status

Last updated: 2026-08-18

## One-Line Status

The deployed exact-SHA baseline remains unchanged; selective Feishu content publishing and the Dongchedi fixes are verified locally, not pushed or deployed.

## Current Focus

- Homepage automatic runs, review single/batch actions, and Canvas `publish.feishu@2` support complete, title/body-only, or image/video-only writes through one persisted queue contract; compatibility defaults remain complete writes.
- Dongchedi category tasks discover current `/article/{id}` links (with legacy `/ugc/article/{id}` compatibility), process up to 30 current-page articles serially into review drafts, and fail clearly when authenticated markup is unavailable; optional Cookie state stays encrypted and Feishu is disabled.
- Port 3001 is the only local application environment; `npm run local` restarts its uncommitted development preview.
- Production exposes versioned identity and preserves its PostgreSQL/config/data/media volumes and unrelated services.
- Only main plus the local WIP archive branch remain locally; merged GitHub branches and extra worktrees were removed.

## Next Entry

Start new work from current main, preview only on port 3001, commit before candidate restart, then promote the unchanged verified SHA.

## Recent Verification

- 2026-08-18: Selective Feishu publish mode contracts, API/queue/simple-run/review/Canvas checks, full offline baseline, and mocked Chromium at 1440x1000 and 390x844 passed without real Feishu or provider calls; Canvas invalid nested toolbar selects were corrected after the browser exposed a hydration error.
- 2026-08-18: `npm run local` restarted the dirty-worktree development preview on port 3001; full offline baseline and HTTP health passed.
- 2026-08-17: Current Dongchedi category `/article/{id}` discovery and canonicalization fix passed focused fixtures, direct-import compatibility checks, lint, TypeScript, build, and the complete offline baseline; Playwright was diagnostic-only and no auth state was saved.
- 2026-08-17: full local and isolated VPS baselines, exact-SHA deployment, identity, health, 30-table PostgreSQL schema, six unchanged FluxPost volumes, protected services, empty recent error log, two rescue tags, active weekly timer, and three-way parity passed.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Local builds over the large retained media tree emit known Turbopack dynamic-path tracing warnings.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
