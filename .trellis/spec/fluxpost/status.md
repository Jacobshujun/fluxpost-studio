# FluxPost Current Status

Last updated: 2026-08-25

## One-Line Status

The Xray image fix is verified and active on LAN port 3001 from the clean committed candidate.

## Current Focus

- Remote image requests use `127.0.0.1:10808`; unrelated and loopback traffic remains direct.
- Canvas waits through outages and resumes accepted ToAPIs ids without duplicate submission.
- One restartable v2rayN logon task remains; Xray is loopback-only.

## Next Entry

Use the LAN Canvas candidate for operator review. Do not push or deploy without approval.

## Recent Verification

- 2026-08-25: Full offline baseline, Xray primary/backup handshakes, clean LAN candidate activation, version identity, and port-3001 HTTP smoke passed.
- 2026-08-25: Competitor-workbook candidate activation, matching version identity, `/canvas` HTTP smoke, and mocked 1440x960/390x844 workflow, scheduler, and overflow checks passed.
- 2026-08-24: Competitor-workbook 200/778 parsing, hierarchy, redaction, retry/partial-draft, TypeScript, lint, build, isolated smoke, and full baseline passed.
- 2026-08-24: Prior per-image reconstruction, provider resume, publish guards, clean candidate activation, and HTTP smoke passed.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
