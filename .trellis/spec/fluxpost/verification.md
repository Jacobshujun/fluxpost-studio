# Verification

Last updated: 2026-08-04

## Baseline Command

Run the cross-platform deterministic baseline before claiming code completion:

```powershell
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

`.trellis/verification/check.ps1` is a Windows compatibility wrapper around `.trellis/verification/check.mjs`. The smoke server is an isolated child process with `FLUXPOST_DISABLE_BACKGROUND_WORKERS=1`; normal local and production starts must leave Canvas workers enabled.

## Current Automated Checks

The baseline verifies:

- Trellis file existence, context budgets, latest markers, JSON validity, and feature evidence limits.
- PostgreSQL schema, accounts/ownership, libraries, configuration, TOS, deployment scripts, execution logs, platform mappings, media, video, concurrency, queues, Feishu enqueue/chunk/resume/media boundaries, source imports, review flows, and row-level persistence.
- Infinite Canvas graph/workflow/API/DAG, common nodes, media helpers, provider resume, scheduler, frozen copy input, copy-library, and original-batch contracts without paid calls.
- `npm run lint`, `npx --no-install tsc --noEmit`, and `npm run build`.
- Isolated production HTTP smoke and SQLite store validation.

The default baseline must not call live TikHub, text/image providers, Seedance, ComfyUI, Feishu writes, Lark replies, or simple-run production.

## Candidate Release Checks

For a production candidate:

1. Build from a clean worktree rooted at current GitHub `main`.
2. Run focused checks, the baseline, TypeScript, lint, and production build.
3. Push a dedicated branch and verify the remote full SHA.
4. Run `/opt/fluxpost-studio/bin/verify-candidate.sh --ref FULL_40_CHARACTER_SHA` and require a commit-bound passing manifest before approval; this isolated gate must not read production configuration, mount runtime volumes, or activate services.
5. Run read-only production preflight.
6. Deploy only through `/opt/fluxpost-studio/bin/deploy.sh --ref FULL_40_CHARACTER_SHA` after separate explicit approval.
7. Verify manifest/image/container identity, app/PostgreSQL, Nginx/public HTTPS, protected services, schema, auth boundaries, volumes, and retained rollback release.

Do not deploy a dirty worktree, branch name, abbreviated SHA, local runtime rows, or unpushed commit.

## Recent Verification

- 2026-08-04: Configurable workspace content safety passed ordered-rule/match-mode/threshold/model-fallback/API/audit/snapshot checks, mocked Chromium, TypeScript, lint, build/restart, local HTTP, SQLite, and the complete baseline without live providers. Exact SHA `e6692c3d0cce807106e343c43a9804be2686ec3d` then passed the isolated VPS verifier and deployed as `20260804-102825-e6692c3d0cce` after zero-active-work preflight and a validated root-only backup; manifest/image/container identity, app/PostgreSQL, routes/auth, six volumes, Nginx, Open WebUI, logs, and rollback retention passed.
- 2026-08-04: Feishu bulk publishing passed id-only durable enqueue checks, worker-side preparation, 1/10/11/50/51 chunk boundaries, partial continuation, retry safety, progress restoration, TypeScript, lint, build, local restart/HTTP, and the complete baseline. Exact SHA `39f99e2415fa93c08e8727bea30841e88d28a2a6` then passed the isolated VPS verifier and deployed as `20260804-081822-39f99e2415fa` after zero-active-work preflight and a validated root-only backup; identity, health, routes/auth, workers, JSONB queue storage, six volumes, logs, Open WebUI, and rollback retention passed without a live Feishu write.
- 2026-08-04: Exact SHA `06a2d7b81dc491c2c4ce1a17f6d3584e3c5d4605` passed captured-drag Chromium and local/VPS baselines, then deployed as `20260804-025759-06a2d7b81dc4` after zero-work preflight and validated backup. Identity, health, routes/auth, volumes, logs, and rollback retention passed.
- 2026-08-04: Exact SHA `fedceccfda93401cc1539df034dbd1833647b4a3` passed mocked Chromium and complete local/VPS baselines, then deployed as `20260804-023054-fedceccfda93` after zero-work preflight and backup. Identity, services, routes/auth, schema, workers, six volumes, logs, and rollback retention passed.
- 2026-08-03: Exact SHA `a65767384c1b1993c95c8c32d053edcd10c3fac6` passed the complete local baseline and commit-bound isolated VPS verifier, then deployed to production 38 as `20260803-075434-a65767384c1b` after a zero-active-work preflight and validated root-only PostgreSQL backup. Manifest/image/container identity, app/PostgreSQL health, Nginx/public HTTPS, Open WebUI identity, routes/auth boundaries, required schema, workers, six named volumes, and retained rollback passed without provider or external-write calls.
Older evidence is preserved in `.trellis/spec/fluxpost/archive/verification-history.md`.

## Missing Coverage

- No live paid Seedance, GPT image/text, TikHub, ComfyUI, Feishu, or Lark action is part of the default baseline.
- No local Canvas history, media, account, or configuration migration was performed.
- No authenticated production Canvas create/save/run walkthrough or multi-user PostgreSQL concurrency test was run during this release.
- The unchanged `origin/main` review-desk source/check mismatch remains a separate integration issue; do not weaken the check to hide it.
- No default check changes DNS, firewall, Nginx routing, Docker volumes, or external production services.
- The package audit reports eight high-severity transitive advisories; do not run automatic `npm audit fix --force` as part of release verification.

## Future Check Rules

- Add baseline checks only when deterministic, isolated, and non-mutating.
- Record live external checks as manual operator gates.
- A candidate SHA change invalidates previous release evidence.
- Keep recent verification to five entries and archive older detail.
- Never weaken a failing check to make the baseline pass; isolate a demonstrably unchanged blocker and run the remaining checks explicitly.
