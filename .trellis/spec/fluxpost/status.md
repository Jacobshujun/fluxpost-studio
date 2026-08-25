# FluxPost Current Status

Last updated: 2026-08-25

## One-Line Status

Canvas partial per-image schedules retry failed images without repeating successes; the clean candidate is active on port 3001.

## Current Focus

- V1/V2 child, V2 row, and pre-freeze shared retries accept partial per-image runs with failures; generic partial runs do not.
- Historical Canvas `taskConcurrency` values are inert; Canvas workers and shared provider pools remain the execution-pressure boundaries.
- Remote image requests use `127.0.0.1:10808`; unrelated and loopback traffic remains direct.
- Canvas waits through outages and resumes accepted ToAPIs ids without duplicate submission.
- One restartable v2rayN logon task remains; Xray is loopback-only.

## Next Entry

Use the LAN Canvas candidate for operator review. Do not push or deploy without approval.

## Recent Verification

- 2026-08-25: Canvas unrestricted admission and partial per-image V1/V2 child, row, and shared retry passed focused/full checks, mocked Chromium at 1440x960/390x844, clean activation, exact identity, and port-3001 smoke without live providers or Feishu.
- 2026-08-25: Offline baseline, Xray primary/backup handshakes, LAN activation, identity, and port-3001 smoke passed.
- 2026-08-25: Competitor workbook activation, identity, `/canvas` smoke, and mocked 1440x960/390x844 workflow/overflow checks passed.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
