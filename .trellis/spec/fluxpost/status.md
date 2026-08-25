# FluxPost Current Status

Last updated: 2026-08-25

## One-Line Status

The Xray image fix is verified; port 3001 remains on the prior candidate until this fix is committed.

## Current Focus

- Remote image requests use `127.0.0.1:10808`; unrelated and loopback traffic remains direct.
- Canvas waits through outages and resumes accepted ToAPIs ids without duplicate submission.
- One restartable v2rayN logon task remains; Xray is loopback-only.

## Next Entry

Commit the verified fix, then replace the port-3001 listener through `npm run local` and verify `/canvas` plus version identity. Do not push or deploy without approval.

## Recent Verification

- 2026-08-25: Full offline baseline passed with image transport/Canvas/ToAPIs regression checks, lint, TypeScript, production build, and isolated HTTP smoke; credential-free primary/backup HTTPS handshakes through Xray passed.
- 2026-08-25: Competitor-workbook candidate activation, matching version identity, `/canvas` HTTP smoke, and mocked 1440x960/390x844 workflow, scheduler, and overflow checks passed.
- 2026-08-24: Competitor-workbook 200/778 parsing, hierarchy, redaction, retry/partial-draft, TypeScript, lint, build, isolated smoke, and full baseline passed.
- 2026-08-24: Prior per-image reconstruction, provider resume, publish guards, clean candidate activation, and HTTP smoke passed.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
