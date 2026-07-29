# Trellis Status

Last updated: 2026-07-29

## One-Line Status

Production 38 runs verified Canvas SHA `d05caddb17875bb9a5dde924f9e4e8654f8d3ee3`; the isolated shared-library release candidate is awaiting exact-SHA baseline, remote equality, and read-only production preflight.

## Current Focus

- Candidate branch `release/shared-libraries-20260729` is based on the deployed Canvas release, not the dirty divergent local `main`.
- Candidate scope is limited to the LAN-safe member upload fix, team-default image/copy entries, six stable sorts, versioned image cursors, batch selection/actions, and fixed internal scrolling.
- Legacy material types and migration remain present and private. Tag-input, image-role removal, unfinished tasks, runtime data, local configuration, screenshots, and unrelated infrastructure changes remain excluded.
- Focused library, copy, Canvas, scheduler, and deployment checks, TypeScript, lint, production build, and mocked desktop/mobile browser regression passed before commit without external service calls.
- Production mutation remains blocked until the committed full SHA passes the complete baseline, is pushed to a dedicated branch with matching remote SHA, passes read-only production preflight, and receives explicit user approval.

## Next Entry

1. Commit the complete candidate and run the full deterministic baseline against that exact SHA.
2. Push the dedicated candidate branch and independently confirm local/remote full-SHA equality.
3. Run read-only production preflight and present the SHA, rollback release, verification evidence, and residual risks for explicit deployment approval.
4. Deploy only through `/opt/fluxpost-studio/bin/deploy.sh --ref <full-sha>`; promote GitHub `main` by fast-forward only after production verification.

## Recent Verification

- 2026-07-29: Focused library/copy/Canvas/scheduler/deployment checks, TypeScript, lint with six existing Canvas warnings, production build, and mocked 1440x960/390x844 library browser checks passed. Four screenshots were inspected without page overflow or incoherent overlap.
- 2026-07-29: Candidate inventory review preserved legacy migration and excluded debug screenshots, environment/runtime files, tag-input changes, image-role changes, unfinished tasks, and unrelated deployment work.
- Earlier production evidence is preserved in the active release task and verification history.

## Current Risks

- Any content edit after the committed candidate SHA invalidates its baseline and remote/preflight evidence.
- Real provider calls, Feishu writes, authenticated multi-user concurrency, and local-history/data migration are not part of this release verification.
- `npm ci` reports eight high-severity dependency advisories; do not apply an unscoped forced audit fix during release preparation.
- Production environment, PostgreSQL, advanced config, media volumes, Nginx, Open WebUI, and unrelated services must remain server-local and preserved.
- Do not expose `.env*`, credentials, API keys, database values, user data, or auth logs in Git, Trellis, commands, or responses.

## Necessary History Paths

- Active release evidence: `.trellis/tasks/07-29-integrate-verify-production-release/research/release-evidence.md`
- Verification history: `.trellis/spec/fluxpost/archive/verification-history.md`
- Handoff history: `.trellis/spec/fluxpost/archive/handoff-history-2026-06-17.md`
- Progress history: `.trellis/spec/fluxpost/archive/progress-history-2026-06-17.md`

## Handoff Minimum Standard

After reading `AGENTS.md`, this file, `feature_list.json`, and `rules.md`, a new session must know the current candidate gate, next command boundary, production identity, and prohibited deployment actions. Keep detailed release evidence in the active task.
