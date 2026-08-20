# FluxPost Current Status

Last updated: 2026-08-20

## One-Line Status

Finished-body governance and the Canvas local video-loader queue are implemented and pass the complete offline baseline; the video-loader is live on the versioned local candidate, with no production deployment.

## Current Focus

- `input.video-loader@1` stores up to 200 ordered MP4/MOV/WebM snapshots, ordinary runs emit only the current video, and V2 scheduling freezes one video per task.
- Authenticated raw uploads stream/hash/probe up to 512 MB and persist through the runtime-media boundary; mocked browser checks cover desktop queue flows and 390px Inspector overflow.
- The parallel finished-body policy remains present and green; port 3001 serves the current clean committed candidate.

## Next Entry

Commit the finished-body task separately; the video-loader candidate is ready for operator checks at `http://127.0.0.1:3001/canvas`.

## Recent Verification

- 2026-08-20: Canvas video-loader focused upload/workflow/scheduler checks, mocked Chromium desktop/mobile flows, lint, TypeScript, build, isolated smoke, the complete offline baseline, and clean candidate identity on port 3001 passed without external services.
- 2026-08-20: Finished-body Unicode/prompt/repair/history/persistence/review/copy/Canvas/Feishu checks also passed in the same complete offline baseline without live providers.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Local builds over the large retained media tree emit known Turbopack dynamic-path tracing warnings.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
