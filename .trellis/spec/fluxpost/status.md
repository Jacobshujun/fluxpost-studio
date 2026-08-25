# FluxPost Current Status

Last updated: 2026-08-25

## One-Line Status

Canvas partial state is isolated to run diagnostics; review drafts and Feishu publishing no longer inherit Excel or Canvas partial policy.

## Current Focus

- Only failed Canvas tasks retry; partial diagnostics stay in Canvas and never enter review or Feishu policy.
- Historical `taskConcurrency` is inert; Canvas/provider pools own execution pressure.
- Generated posts omit `canvasImageBatch`; the dry-run cleanup removes only that key with `--apply`.

## Next Entry

Commit and activate the verified candidate, then clean the legacy generated-post key and check the review desk without publishing.

## Recent Verification

- 2026-08-25: Excel/generic aggregation parity, review/publish isolation, failed-only retry, SQLite/PostgreSQL cleanup contracts, lint, TypeScript, build, isolated smoke, and the full baseline passed without live providers or Feishu.
- 2026-08-25: Earlier Xray and competitor-workbook candidates passed offline baseline, identity, port-3001 smoke, and mocked desktop/mobile checks.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
