# FluxPost Current Status

Last updated: 2026-08-18

## One-Line Status

The deployed SHA is unchanged; port 3001 now has one candidate-only runtime, while local feature changes remain unpushed.

## Current Focus

- Homepage automatic runs, review single/batch actions, and Canvas `publish.feishu@2` support complete, title/body-only, or image/video-only writes through one persisted queue contract; compatibility defaults remain complete writes.
- Dongchedi category tasks discover current `/article/{id}` links (with legacy `/ugc/article/{id}` compatibility), process up to 30 current-page articles serially into review drafts, and fail clearly when authenticated markup is unavailable; optional Cookie state stays encrypted and Feishu is disabled.
- Port 3001 runs only the clean committed candidate: `npm run local` binds loopback and `npm run local:lan` exposes the same SHA to the LAN; normal workers and the existing account system apply to both.
- Production exposes versioned identity and preserves its PostgreSQL/config/data/media volumes and unrelated services.
- Only main plus the local WIP archive branch remain locally; merged GitHub branches and extra worktrees were removed.

## Next Entry

Verify and commit each fix before `npm run local` replaces the port-3001 candidate; use `npm run local:lan` only when LAN access is needed, then promote the unchanged verified SHA.

## Recent Verification

- 2026-08-18: Candidate-only loopback/LAN commands, clean-tree guard, permissions, full baseline, build, and isolated smoke passed without live providers.
- 2026-08-18: Selective Feishu publish mode contracts, API/queue/simple-run/review/Canvas checks, full offline baseline, and mocked Chromium at 1440x1000 and 390x844 passed without real Feishu or provider calls; Canvas invalid nested toolbar selects were corrected after the browser exposed a hydration error.
- 2026-08-17: Current Dongchedi category `/article/{id}` discovery and canonicalization fix passed focused fixtures, direct-import compatibility checks, lint, TypeScript, build, and the complete offline baseline; Playwright was diagnostic-only and no auth state was saved.
- 2026-08-17: full local and isolated VPS baselines, exact-SHA deployment, identity, health, 30-table PostgreSQL schema, six unchanged FluxPost volumes, protected services, empty recent error log, two rescue tags, active weekly timer, and three-way parity passed.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Local builds over the large retained media tree emit known Turbopack dynamic-path tracing warnings.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
