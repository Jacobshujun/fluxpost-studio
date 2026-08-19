# FluxPost Current Status

Last updated: 2026-08-19

## One-Line Status

The Seedance Prompt assistant now loads an operator-managed Skill at request time and reports its version; port 3001 must be refreshed after this change is verified and committed.

## Current Focus

- Canvas Seedance Prompt optimization reads optional `SEEDANCE_PROMPT_SKILL_PATH` on the server, automatically reloads changed files, exposes only source/hash metadata, and retains FluxPost hard audits after the mutable Skill reference.
- Simple Runs use frozen workspace prompts; pool runs remain review-first and Feishu-disabled.
- Desktop Canvas accepts local image drops at the pointer or onto a compatible image node through runtime media only; dropped files never enter the shared library.
- Canvas `model.seedance@1` now combines TOS-backed direct uploads with fixed upstream images, supports stable official-style `@图片N` Prompt mentions, freezes provider-facing Prompt/image order, and resumes the original Ark task ID without re-resolution; old upstream-only nodes remain loadable.
- Dongchedi category tasks discover current `/article/{id}` links (with legacy `/ugc/article/{id}` compatibility), process up to 30 current-page articles serially into review drafts, and fail clearly when authenticated markup is unavailable; optional Cookie state stays encrypted and Feishu is disabled.
- Port 3001 runs only the clean candidate: `npm run local` binds loopback, `local:lan` exposes the same SHA, and startup resumes queued Feishu work; the existing accounts apply to both.

## Next Entry

Before further code work, confirm `/api/version` matches clean HEAD; use `npm run local` if final Trellis metadata commits advance the SHA.

## Recent Verification

- 2026-08-19: Runtime Seedance Skill refresh/error/metadata checks, lint, TypeScript, build, HTTP/SQLite smoke, and the complete offline baseline passed without provider calls.
- 2026-08-19: Seedance Prompt assistant contracts, offline baseline, and mocked Chromium apply flow at 1440x960/390x844 passed without provider calls; candidate `ca8afe7` served on port 3001.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Local builds over the large retained media tree emit known Turbopack dynamic-path tracing warnings.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
