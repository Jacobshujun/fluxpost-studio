# Integrate, Verify, And Deploy Production Release

## Goal

Produce a clean, fully verified production candidate that reconciles the current local and GitHub histories, then deploy only its approved full Git SHA to the supported production host `38.76.210.136` without copying local configuration or runtime data.

## Background

- Production currently runs the previously verified Canvas candidate `d05caddb17875bb9a5dde924f9e4e8654f8d3ee3` through the release wrapper at `/opt/fluxpost-studio/bin/deploy.sh`.
- Local `main` currently points to `2279f31` and has diverged from the locally cached `origin/main`: 14 local-only commits and 7 remote-only commits.
- The remote-only history includes the reference/vehicle library release, deterministic verification repairs, and an older staging-policy commit. The local-only history includes Canvas, copy-library/batch rewriting, and the member library upload fix.
- The working tree now contains 75 modified/deleted tracked files plus untracked source, task, verification, worktree, and local debug artifacts. These changes span several existing Trellis tasks and cannot be copied wholesale into a release.
- The earlier Canvas deployment explicitly excluded unrelated sorting, selection, tag-input, and debug changes and recorded later full-feature convergence as follow-up work.
- Runtime secrets, PostgreSQL rows, generated/crawled media, local debug artifacts, and environment files are not release inputs and must not be committed, pushed, or copied to production.

## Requirements

- R1. Define an explicit candidate feature/change scope before changing Git history or staging files.
- R2. Build the candidate from current GitHub history and integrate only approved local commits and working-tree changes, preserving remote production fixes.
- R3. Do not deploy local `main`, a dirty worktree, an unpushed commit, a branch name, or an abbreviated SHA.
- R4. Keep user-owned working-tree changes and unrelated untracked artifacts intact; do not reset, overwrite, clean, or sweep them into the candidate.
- R5. Run focused checks for every integrated feature and the complete deterministic Trellis baseline, including lint, TypeScript, production build, isolated HTTP smoke, SQLite checks, and deployment guards, without calling paid or production integrations.
- R6. Push the candidate to a dedicated remote branch and independently confirm that the remote full SHA equals the locally verified SHA.
- R7. Before deployment, run read-only production preflight covering current release identity, app/PostgreSQL health, loopback port 3101, public HTTPS/Nginx, protected unrelated services, persistent volumes, and rollback availability.
- R8. Present the final candidate scope, full SHA, verification evidence, known residual risks, and rollback release to the user. Production deployment requires a separate explicit approval after this evidence is available.
- R9. Deploy only through `/opt/fluxpost-studio/bin/deploy.sh --ref <full-sha>` and preserve server-local `shared/env.production`, the advanced-config volume, PostgreSQL, media volumes, Nginx, Open WebUI, and unrelated services.
- R10. After deployment, verify manifest/image/commit identity, app/PostgreSQL health, public HTTPS and key routes, authentication boundaries, required schema, workers, persistent volumes, protected services, and retained rollback release.
- R11. If deployment health checks fail, rely on automatic release restoration and verify the prior release; if a post-deploy gate fails, use the manifest-aware rollback command and report the evidence.
- R12. Limit the candidate feature scope to the latest GitHub baseline plus the deployed Canvas/copy-batch workflow, member library upload, shared image/copy library sorting and batch selection, legacy local-material retirement, local Next build slimming, Canvas condition-random unique copy assignment, bounded Canvas queue concurrency, and the directly related Canvas run/retry reliability fixes.
- R13. Exclude root-worktree VPS wrapper changes because the candidate already carries newer wrapper/version-lock/verification contracts; also exclude unowned Feishu table-id/CLI changes, review-upload refactoring, broad root verification rewrites, unfinished tasks, local debug artifacts, screenshots, runtime state, and unrelated spec changes.
- R14. After the exact candidate SHA passes production verification, converge GitHub `main` to the same candidate history through a non-force update. Do not rewrite or clean the current local dirty `main` worktree.

## Acceptance Criteria

- [ ] AC1: The approved candidate scope maps every included commit and working-tree file to a feature or required integration fix, with unrelated changes excluded. (R1-R4)
- [ ] AC2: The candidate is based on the latest fetched GitHub `main`, retains required remote fixes, and contains no secrets, runtime state, generated media, or debug artifacts. (R2-R4)
- [ ] AC3: Focused checks and the complete deterministic baseline pass for the exact candidate SHA, or deployment remains blocked with the failure reported. (R5)
- [ ] AC4: A dedicated GitHub branch exposes the exact verified full SHA, and local/remote SHA equality is recorded. (R6)
- [ ] AC5: Read-only production preflight passes and records a usable rollback release before any production mutation. (R7)
- [ ] AC6: The user explicitly approves the evidenced full SHA after local verification and production preflight. (R8)
- [ ] AC7: Production deploys the approved full SHA through the installed release wrapper without replacing environment files or deleting named volumes. (R9)
- [ ] AC8: Post-deploy identity, route, auth, schema, worker, database, volume, Nginx, public HTTPS, and protected-service checks pass. (R10)
- [ ] AC9: The previous production release remains available, and any failed activation or post-deploy gate restores it without data-volume deletion. (R11)
- [ ] AC10: The release inventory contains only the approved feature groups in R12 and their required checks/spec facts; every R13 exclusion remains outside the candidate. (R12-R13)
- [ ] AC11: After production verification, GitHub `main` contains the deployed candidate SHA without force-push, while the original local dirty worktree and its branch remain intact. (R14)

## Out Of Scope

- Copying local accounts, database rows, Canvas history, generated/crawled media, secrets, or `.env.local` to production.
- Changing DNS, Nginx routing, SSH, firewall, Docker service configuration, production credentials, or unrelated VPS services.
- Running live TikHub, text/image provider, ComfyUI, Feishu write, Lark reply, or real content-production jobs as release verification.
- Deleting, resetting, or otherwise tidying unrelated local work and debug artifacts.
- Root-worktree deployment-wrapper changes, Feishu table-id/CLI changes, review-upload refactoring, and other unfinished or unverified feature tasks.
