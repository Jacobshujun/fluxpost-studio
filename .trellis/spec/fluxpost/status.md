# FluxPost Current Status

Last updated: 2026-08-25

## One-Line Status

Canvas partial state is isolated to run diagnostics; review drafts and Feishu publishing no longer inherit Excel or Canvas partial policy.

## Current Focus

- Only failed Canvas tasks retry; partial diagnostics stay in Canvas and never enter review or Feishu policy.
- Historical `taskConcurrency` is inert; Canvas/provider pools own execution pressure.
- Generated posts omit `canvasImageBatch`; the dry-run cleanup removes only that key with `--apply`.

## Next Entry

Continue normal local use from the clean port-3001 candidate; keep Canvas partial state internal when extending Excel or review workflows.

## Recent Verification

- 2026-08-25: Candidate `d61d3966ae6afae5916ff82bccfcc97170d27c56` passed the full offline baseline and ran on port 3001. Cleanup removed 7 legacy keys and then matched 0; desktop/mobile review checks kept single/batch Feishu buttons enabled without publishing.
- 2026-08-25: Earlier Xray and competitor-workbook candidates passed offline baseline, identity, port-3001 smoke, and mocked desktop/mobile checks.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
