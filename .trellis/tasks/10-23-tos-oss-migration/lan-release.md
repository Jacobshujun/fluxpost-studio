# LAN release - 2026-10-26

## Follow-up authorization - 2026-10-27

User authorized committing the pending changes and updating LAN again. Commit
the migration CLI/resume work and the separate simple-run diagnosis; do not push,
resume migration, change storage configuration or deploy production. Earlier
running-migration/PID statements below describe the October 26 release only.

Pre-commit checks: all baseline domains before lint passed, including bulk,
resume and CLI fake-worker tests. Full baseline stopped at the existing 17 local
data-script lint errors / 17 warnings. Changed-file ESLint and TypeScript passed;
no gate was weakened. Simple-run overflow is diagnosed, not fixed.

Activate only with `npm run local:lan` after a clean commit. Its inactive-slot
build must pass before listener replacement. Final acceptance requires HEAD,
candidate state and `/api/version` to agree, LAN port 3001 binding and HTTP smoke.
Post-activation results belong in ignored `test-artifacts/lan-release-2026-10-27.json`;
this authorization/preflight entry is not itself proof of successful activation.

User explicitly authorized committing remaining changes and updating LAN.
Preserve Qwen 0b775c7, generated library bbe4ff9 and OSS preparation 6128b6b;
commit the bulk engine/test/doc changes on top, never amend history.

## Boundaries

- Activation command: npm run local:lan (primary worktree, clean full HEAD).
- restart.ps1 builds inactive .next-local-a/b before stopping only port-3001 PID;
  it must not touch independent bulk PID 46412. No broad process termination.
- Effective config including the user-selected persistent override was inspected
  without printing secrets: tos selected/enabled, oss disabled, normal workers.
- No storage provider switch, source deletion, history rewrite, GitHub push or
  production deploy. New candidate includes Qwen/library changes and normal
  application worker startup, but no acceptance paid-model jobs are launched.
- Bulk copy continues independently, not complete; use bulk-run.md/progress.json.

## Checks and execution evidence

- Focused bulk tests, changed-source lint and TypeScript pass.
- Full baseline rerun log: .tmp-lan-release-baseline.log; known 17 ignored-script
  lint errors are not waived/changed. Any other failure blocks activation.
- Candidate build and built-in identity/auth smoke: .tmp-lan-release-activation.log.
- Runtime activation state: ignored .fluxpost-local-candidate.json and
  .next-local-a/b/.fluxpost-commit; compare to git rev-parse HEAD and /api/version.
- Post-activation evidence: ignored test-artifacts/lan-release-verification.json;
  only write success evidence after verifying SHA/binding/HTTP and live migration.
- The migration task remains in progress; code release is not storage completion.
