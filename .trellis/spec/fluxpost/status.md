# FluxPost Current Status

Last updated: 2026-08-25

## One-Line Status

Canvas Excel ordinary-run readiness and durable latest-attempt display are verified offline.

## Current Focus

- `运行全部` tests one frozen row/card; V2 owns full-workbook scheduling.
- Latest failure/wait state and older success previews coexist; review/Feishu policy is unchanged.

## Next Entry

Commit and activate the verified candidate on port 3001, then run mocked desktop/mobile Canvas checks.

## Recent Verification

- 2026-08-25: Excel readiness, save/run feedback, workflow-first history, dual projections, redaction, Xray wait UI, build, smoke, and full offline baseline passed without external calls.

## Risks And Unknowns

- Historical image attempts still require working Xray; the UI does not operate it.
- Nine high-severity transitive advisories remain; do not run `npm audit fix --force`.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
