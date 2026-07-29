# Production Candidate Integration Design

## Candidate Boundary

Use the already deployed and remotely reachable `d05caddb17875bb9a5dde924f9e4e8654f8d3ee3` as the clean integration base. Create an isolated release worktree and branch under the workspace. The current root worktree, local `main`, uncommitted user changes, and untracked artifacts remain untouched.

The candidate starts with the deployed Canvas/copy-batch history, the LAN-safe member upload fix, and shared library visibility/sorting/selection behavior already present on `release/shared-libraries-20260729`. New commits add legacy local-material retirement, local Next build slimming, Canvas condition-random unique copy assignment, bounded Canvas queue concurrency, and directly related Canvas run/retry reliability fixes, with focused checks and only the stable Trellis facts required to describe those contracts.

## Selective Porting

Do not merge or rebase local `main`, and do not copy complete dirty files. Use the approved task requirements and diffs as the source of truth, then apply only owned hunks to the clean candidate. Preserve remote-only library behavior while retiring the legacy material types, routes, tables, and migration path approved for this release.

New helper modules may be copied as complete files only after confirming that every exported contract is referenced by an approved task. Existing files require hunk-level review. In particular, `src/lib/canvas/runs.ts` and `src/lib/canvas/scheduler.ts` contain multiple independently owned changes and must be split by hunk. A candidate inventory records every changed path and its owning requirement before commit.

The root VPS wrapper is version 2 while the candidate carries newer version-3 locking and candidate-verification behavior, so root deployment hunks are excluded. Root Feishu table-id/CLI changes, review-upload delegation, broad verification rewrites, screenshots, and runtime/debug artifacts are also excluded from this release.

## Git Flow

```text
origin/main 0f6e499
    |
    +-- deployed Canvas candidate d05cadd
            |
            +-- release candidate <FULL_SHA>
                    |
                    +-- production deploy
                    +-- fast-forward origin/main after production verification
```

The candidate branch is pushed before production preflight. Remote SHA equality is verified independently. GitHub `main` is not updated before successful post-deploy checks. If `origin/main` changes after candidate creation, promotion is aborted and the candidate is rebuilt and reverified; force-push is forbidden.

## Integration Order

1. Preserve the existing shared-library candidate commits.
2. Port legacy local-material retirement and its schema/API/simple-run checks.
3. Port local Next build slimming and Docker-mode verification.
4. Port Canvas random copy assignment, then Canvas queue concurrency and the related run/retry reliability hunks.
5. Update candidate-owned Trellis facts without copying the dirty root spec set wholesale.

Each feature group is committed separately so a failed gate can be reverted without discarding the other verified groups.

## Verification Gates

Gate 1 validates the candidate inventory and absence of secrets/runtime/debug artifacts. Gate 2 runs focused library, Canvas, deployment, TypeScript, lint, build, and browser checks. Gate 3 runs the complete deterministic Trellis baseline on the committed candidate SHA. Gate 4 confirms the remote branch SHA. Gate 5 is read-only production preflight. Gate 6 is explicit user approval of the evidenced SHA. Gate 7 deploys and verifies production. Gate 8 fast-forwards GitHub `main` and confirms ancestry.

No paid provider, TikHub, ComfyUI, Feishu write, Lark reply, local-history migration, or production content job is part of verification.

## Environment And Data Boundary

The release contains source only. VPS `shared/env.production`, advanced configuration, PostgreSQL, runtime files, generated/crawled media, node home, Nginx, and unrelated services remain server-local. No local data or environment file is copied. Legacy material tables are retired idempotently during database initialization, but original local image files are never deleted. Rollback may recreate the unused legacy tables through an older app version; it does not restore retired table rows and must not be represented as a local-material data rollback.

## Rollback

- Before push, discard only the isolated candidate worktree/branch; root user work is unaffected.
- Before deploy, any failed gate blocks deployment with no production mutation.
- During activation, the installed wrapper restores the prior release after failed health checks.
- After activation, a failed identity, route, auth, database, volume, Nginx, HTTPS, worker, or protected-service check triggers manifest-aware rollback.
- Do not promote GitHub `main` until post-deploy gates pass.
