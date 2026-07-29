# Trellis Status

Last updated: 2026-07-29

## One-Line Status

Production 38 runs verified Canvas SHA `d05caddb17875bb9a5dde924f9e4e8654f8d3ee3`; the expanded isolated release candidate is awaiting commit, exact-SHA baseline, remote equality, and read-only production preflight.

## Current Focus

- Candidate branch `release/shared-libraries-20260729` is based on the deployed Canvas release, not the dirty divergent local `main`.
- Candidate scope includes the LAN-safe member upload fix, shared image/copy library visibility/sorting/selection, legacy local-material retirement, local Next build slimming, Canvas condition-random unique copy assignment, bounded Canvas run workers, and directly related stale-error/retry-order reliability fixes.
- Legacy local-material types, routes, tables, and JSON migration are retired; original local image files are not deleted. Tag-input, image-role removal, unfinished tasks, runtime data, local configuration, screenshots, root wrapper v2, Feishu table-id/CLI edits, review-upload refactoring, and unrelated infrastructure changes remain excluded.
- The untouched candidate baseline passed before the expanded port. After the port, focused library/local-material/build-output/Canvas checks, TypeScript, lint, the 47-route production build, and the VPS deployment contract check passed locally without external service calls; the complete baseline remains required on the final committed SHA.
- Production mutation remains blocked until the committed full SHA passes the complete baseline, is pushed to a dedicated branch with matching remote SHA, passes read-only production preflight, and receives explicit user approval.

## Next Entry

1. Commit the complete candidate and run the full deterministic baseline against that exact SHA.
2. Push the dedicated candidate branch and independently confirm local/remote full-SHA equality.
3. Run read-only production preflight and present the SHA, rollback release, verification evidence, and residual risks for explicit deployment approval.
4. Deploy only through `/opt/fluxpost-studio/bin/deploy.sh --ref <full-sha>`; promote GitHub `main` by fast-forward only after production verification.

## Recent Verification

- 2026-07-29: After the expanded port, focused local-material, local-build-output, library, Canvas scheduler/workflow/concurrency, simple-run, and viral checks passed; TypeScript passed and lint reported only six existing Canvas warnings. The VPS check still requires the staging/Docker gate because sandboxed Bash spawn returned `EPERM`.
- 2026-07-29: Candidate inventory review retired the approved legacy local-material surfaces and excluded debug screenshots, environment/runtime files, tag-input changes, image-role changes, unfinished tasks, root wrapper v2, Feishu/media refactors, and unrelated deployment work.
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
