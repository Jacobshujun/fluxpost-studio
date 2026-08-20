# FluxPost Current Status

Last updated: 2026-08-20

## One-Line Status

The Canvas local video-loader queue is implemented and passes the complete offline baseline; it has not been deployed.

## Current Focus

- `input.video-loader@1` stores up to 200 ordered MP4/MOV/WebM snapshots, ordinary runs emit only the current video, and V2 scheduling freezes one video per task.
- Authenticated raw uploads stream/hash/probe up to 512 MB and persist through the runtime-media boundary; mocked browser checks cover desktop queue flows and 390px Inspector overflow.
- Port 3001 remains reserved for a clean committed candidate.

## Next Entry

Commit the verified video-loader candidate, run `npm run local`, then confirm `/api/version` matches clean HEAD and `/canvas` loads on port 3001.

## Recent Verification

- 2026-08-20: Canvas video-loader focused upload/workflow/scheduler checks, mocked Chromium desktop/mobile flows, lint, TypeScript, build, isolated smoke, and the complete offline baseline passed without external services.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Local builds over the large retained media tree emit known Turbopack dynamic-path tracing warnings.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
