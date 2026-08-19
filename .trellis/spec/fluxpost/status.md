# FluxPost Current Status

Last updated: 2026-08-19

## One-Line Status

Seedance 2.5 Ark migration is verified offline; port 3001 still runs the prior clean candidate until the change is committed.

## Current Focus

- Simple Runs use frozen workspace prompts; pool runs remain review-first and Feishu-disabled.
- Desktop Canvas accepts local image drops at the pointer or onto a compatible image node through runtime media only; dropped files never enter the shared library.
- Canvas `model.seedance@1` now uses Ark Seedance 2.5 with persisted task-ID resume, public HTTP(S) references, audio/watermark controls, and local-only configuration preflight; old Dreamina node snapshots remain loadable.
- Dongchedi category tasks discover current `/article/{id}` links (with legacy `/ugc/article/{id}` compatibility), process up to 30 current-page articles serially into review drafts, and fail clearly when authenticated markup is unavailable; optional Cookie state stays encrypted and Feishu is disabled.
- Port 3001 runs only the clean candidate: `npm run local` binds loopback, `local:lan` exposes the same SHA, and startup resumes queued Feishu work; the existing accounts apply to both.

## Next Entry

Verify and commit each fix before `npm run local` replaces the port-3001 candidate; use `npm run local:lan` only when LAN access is needed, then promote the unchanged verified SHA.

## Recent Verification

- 2026-08-19: Ark Seedance 2.5 request/resume/error and legacy-node contracts passed mocked adapter checks, lint, TypeScript, build, HTTP/SQLite smoke, and the full offline baseline without provider calls.
- 2026-08-18: Candidate-only startup, permissions, baseline, build, and smoke passed; startup resume then published the queued Feishu job 16/16 without record or attachment failures.
- 2026-08-18: Selective Feishu publish mode contracts, API/queue/simple-run/review/Canvas checks, full offline baseline, and mocked Chromium at 1440x1000 and 390x844 passed without real Feishu or provider calls; Canvas invalid nested toolbar selects were corrected after the browser exposed a hydration error.
- 2026-08-17: Current Dongchedi category `/article/{id}` discovery and canonicalization fix passed focused fixtures, direct-import compatibility checks, lint, TypeScript, build, and the complete offline baseline; Playwright was diagnostic-only and no auth state was saved.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Local builds over the large retained media tree emit known Turbopack dynamic-path tracing warnings.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
