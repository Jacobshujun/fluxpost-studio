# FluxPost Current Status

Last updated: 2026-08-25

## One-Line Status

Canvas Excel ordinary-run readiness and durable latest-attempt display are verified offline.

## Current Focus

- `运行全部` tests one frozen row/card; V2 owns full-workbook scheduling.
- Latest failure/wait state and older success previews coexist; review/Feishu policy is unchanged.

## Next Entry

Continue local Canvas use from the clean port-3001 candidate; repair Xray separately if image nodes remain waiting.

## Recent Verification

- 2026-08-25: Candidate `4668adc29742bbd1f114effd08b5aa35ba8e11ea` passed Excel readiness, dual-history projection, full offline baseline, port-3001 smoke, and mocked 1440x960/390x844 Canvas checks; no Run/provider/Feishu call was created and mobile overflow was 0.

## Risks And Unknowns

- Historical image attempts still require working Xray; the UI does not operate it.
- Nine high-severity transitive advisories remain; do not run `npm audit fix --force`.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
