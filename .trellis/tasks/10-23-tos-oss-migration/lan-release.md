# LAN release - 2026-10-26

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
