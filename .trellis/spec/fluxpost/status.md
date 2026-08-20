# FluxPost Current Status

Last updated: 2026-08-20

## One-Line Status

Infinite Canvas now has a verified video-subtitle node with Ark timing, hard-subtitle MP4 output, style controls, and owner-scoped presets; port 3001 must be refreshed from the committed candidate.

## Current Focus

- Canvas `utility.video-subtitles@1` accepts one video, caches an owner-scoped validated Ark timeline, emits H.264/AAC hard-subtitle MP4 plus text, and snapshots built-in or owner-scoped style presets.
- Simple Runs use frozen workspace prompts; pool runs remain review-first and Feishu-disabled.
- Desktop Canvas accepts local image drops at the pointer or onto a compatible image node through runtime media only; dropped files never enter the shared library.
- Canvas `model.seedance@1` now combines TOS-backed direct uploads with fixed upstream images, supports stable official-style `@图片N` Prompt mentions, freezes provider-facing Prompt/image order, and resumes the original Ark task ID without re-resolution; old upstream-only nodes remain loadable.
- Dongchedi category tasks discover current `/article/{id}` links (with legacy `/ugc/article/{id}` compatibility), process up to 30 current-page articles serially into review drafts, and fail clearly when authenticated markup is unavailable; optional Cookie state stays encrypted and Feishu is disabled.
- Port 3001 runs only the clean candidate: `npm run local` binds loopback, `local:lan` exposes the same SHA, and startup resumes queued Feishu work; the existing accounts apply to both.

## Next Entry

Commit the verified subtitle candidate, run `npm run local`, then confirm `/api/version` matches clean HEAD and `/canvas` loads on port 3001.

## Recent Verification

- 2026-08-20: Subtitle contracts, real local FFmpeg/ASS encode, owner/admin preset checks, lint, TypeScript, build, HTTP/SQLite smoke, and the offline baseline passed without Ark calls.
- 2026-08-20: Mocked Chromium preview/style/preset/result flows passed at 1440x960 and 390x844 without overflow or browser errors.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Local builds over the large retained media tree emit known Turbopack dynamic-path tracing warnings.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
