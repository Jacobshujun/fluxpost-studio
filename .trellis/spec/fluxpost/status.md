# FluxPost Current Status

Last updated: 2026-08-19

## One-Line Status

Port 3001 remains the clean candidate; prompt-only content production is verified locally and uncommitted.

## Current Focus

- Source-based Simple Runs now use only frozen workspace prompts and explicit media switches; pool runs remain review-first with Feishu disabled. Homepage, review, and Canvas selective Feishu writes share one persisted queue contract.
- Desktop Canvas accepts local image drops at the pointer or onto a compatible image node through runtime media only; dropped files never enter the shared library.
- Dongchedi category tasks discover current `/article/{id}` links (with legacy `/ugc/article/{id}` compatibility), process up to 30 current-page articles serially into review drafts, and fail clearly when authenticated markup is unavailable; optional Cookie state stays encrypted and Feishu is disabled.
- Port 3001 runs only the clean candidate: `npm run local` binds loopback, `local:lan` exposes the same SHA, and startup resumes queued Feishu work; the existing accounts apply to both.
- Only main plus the local WIP archive branch remain locally; merged GitHub branches and extra worktrees were removed.

## Next Entry

Verify and commit each fix before `npm run local` replaces the port-3001 candidate; use `npm run local:lan` only when LAN access is needed, then promote the unchanged verified SHA.

## Recent Verification

- 2026-08-19: Prompt-only production and Canvas image-drop contracts passed focused checks, lint, TypeScript, build, HTTP/SQLite smoke, and the full offline baseline without provider calls.
- 2026-08-18: Candidate-only startup, permissions, baseline, build, and smoke passed; startup resume then published the queued Feishu job 16/16 without record or attachment failures.
- 2026-08-18: Selective Feishu publish mode contracts, API/queue/simple-run/review/Canvas checks, full offline baseline, and mocked Chromium at 1440x1000 and 390x844 passed without real Feishu or provider calls; Canvas invalid nested toolbar selects were corrected after the browser exposed a hydration error.
- 2026-08-17: Current Dongchedi category `/article/{id}` discovery and canonicalization fix passed focused fixtures, direct-import compatibility checks, lint, TypeScript, build, and the complete offline baseline; Playwright was diagnostic-only and no auth state was saved.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Local builds over the large retained media tree emit known Turbopack dynamic-path tracing warnings.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
