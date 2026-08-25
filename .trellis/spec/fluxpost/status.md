# FluxPost Current Status

Last updated: 2026-08-25

## One-Line Status

Excel competitor-workbook Canvas generation is verified and active on port 3001 from the clean committed candidate.

## Current Focus

- `input.competitor-workbook@1` freezes local `.xlsx` rows/cards for administrator-only Canvas V2 schedules and reuses prompt-template, GPT-Image-2 V2, shared references, and social-post composition.
- Hierarchical row/card scheduling supports concurrency `1-5`, progressive admission, pause/resume/cancel/restart, partial drafts, and card/row retry into the original draft.
- Deterministic 200-row/778-card parsing, redaction, scheduler, full baseline, and mocked desktop/mobile Canvas checks passed without live providers or Feishu.

## Next Entry

Use the port-3001 Canvas candidate for operator review. Do not push or deploy without approval.

## Recent Verification

- 2026-08-25: Competitor-workbook candidate activation, matching version identity, `/canvas` HTTP smoke, and mocked 1440x960/390x844 workflow, scheduler, and overflow checks passed.
- 2026-08-24: Competitor-workbook 200/778 parsing, hierarchy, redaction, retry/partial-draft, TypeScript, lint, build, isolated smoke, and full baseline passed.
- 2026-08-24: Prior per-image reconstruction, provider resume, publish guards, clean candidate activation, and HTTP smoke passed.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
