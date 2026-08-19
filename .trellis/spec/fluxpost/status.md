# FluxPost Current Status

Last updated: 2026-08-19

## One-Line Status

Seedance 2.5 structured image mentions and TOS-backed direct references are verified offline; port 3001 still runs the prior clean candidate until the change is committed.

## Current Focus

- Simple Runs use frozen workspace prompts; pool runs remain review-first and Feishu-disabled.
- Desktop Canvas accepts local image drops at the pointer or onto a compatible image node through runtime media only; dropped files never enter the shared library.
- Canvas `model.seedance@1` now combines TOS-backed direct uploads with fixed upstream images, supports stable official-style `@图片N` Prompt mentions, freezes provider-facing Prompt/image order, and resumes the original Ark task ID without re-resolution; old upstream-only nodes remain loadable.
- Dongchedi category tasks discover current `/article/{id}` links (with legacy `/ugc/article/{id}` compatibility), process up to 30 current-page articles serially into review drafts, and fail clearly when authenticated markup is unavailable; optional Cookie state stays encrypted and Feishu is disabled.
- Port 3001 runs only the clean candidate: `npm run local` binds loopback, `local:lan` exposes the same SHA, and startup resumes queued Feishu work; the existing accounts apply to both.

## Next Entry

Verify and commit each fix before `npm run local` replaces the port-3001 candidate; use `npm run local:lan` only when LAN access is needed, then promote the unchanged verified SHA.

## Recent Verification

- 2026-08-19: Seedance structured marker/order/conflict/deleted-reference/TOS/resume contracts, Canvas scheduler/copy fixtures, lint, TypeScript, build, isolated HTTP/SQLite baseline, and mocked Chromium at 1440x960 and 390x844 passed without Ark or TOS calls.
- 2026-08-19: Ark Seedance 2.5 request/resume/error and legacy-node contracts passed mocked adapter checks, lint, TypeScript, build, HTTP/SQLite smoke, and the full offline baseline without provider calls.
- 2026-08-18: Selective Feishu publish mode contracts, API/queue/simple-run/review/Canvas checks, full offline baseline, and mocked Chromium at 1440x1000 and 390x844 passed without real Feishu or provider calls; Canvas invalid nested toolbar selects were corrected after the browser exposed a hydration error.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Local builds over the large retained media tree emit known Turbopack dynamic-path tracing warnings.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
