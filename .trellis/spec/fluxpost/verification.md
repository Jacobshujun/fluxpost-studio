# Verification

Last updated: 2026-08-14

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
- PostgreSQL schema, accounts/ownership, libraries, configuration, TOS, v4 deployment/image-retention/timer scripts, execution logs, platform mappings, media, video, concurrency, queues, Feishu boundaries, source imports, review flows, and row-level persistence.
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
7. Verify identity, health, protected services, schema/auth, unchanged volumes, image-retention preview/results, two rescue tags, and the weekly BuildKit timer.

Do not deploy a dirty worktree, branch name, abbreviated SHA, local runtime rows, or unpushed commit.

## Recent Verification

- 2026-08-14: Production-based candidate code through `011c15e` passed retention, Canvas workflow/video/scheduler, library role-time, review, and all remaining deterministic checks plus lint, TypeScript, production build, isolated HTTP smoke, and SQLite without live providers or external writes. A final evidence-only commit still requires the same complete baseline before its SHA can be proposed for push.
- 2026-08-06: Retention v4 passed fake-Docker checks and the full baseline. Authorized production 38 previews then removed 8 verification tags and old app/rescues while keeping current plus 2 rescues; BuildKit reclaimed `8.998GB` and disk fell from `52GB/69%` to `36GB/47%`. Five containers, 7 volumes, local/public health, final preview, and weekly timer passed.
- 2026-08-04: Configurable workspace content safety passed ordered-rule/match-mode/threshold/model-fallback/API/audit/snapshot checks, mocked Chromium, TypeScript, lint, build/restart, local HTTP, SQLite, and the complete baseline without live providers. Exact SHA `e6692c3d0cce807106e343c43a9804be2686ec3d` then passed the isolated VPS verifier and deployed as `20260804-102825-e6692c3d0cce` after zero-active-work preflight and a validated root-only backup; manifest/image/container identity, app/PostgreSQL, routes/auth, six volumes, Nginx, Open WebUI, logs, and rollback retention passed.
- 2026-08-04: Feishu bulk publishing passed id-only durable enqueue checks, worker-side preparation, 1/10/11/50/51 chunk boundaries, partial continuation, retry safety, progress restoration, TypeScript, lint, build, local restart/HTTP, and the complete baseline. Exact SHA `39f99e2415fa93c08e8727bea30841e88d28a2a6` then passed the isolated VPS verifier and deployed as `20260804-081822-39f99e2415fa` after zero-active-work preflight and a validated root-only backup; identity, health, routes/auth, workers, JSONB queue storage, six volumes, logs, Open WebUI, and rollback retention passed without a live Feishu write.
- 2026-08-03: Exact SHA `a65767384c1b1993c95c8c32d053edcd10c3fac6` passed the complete local baseline and commit-bound isolated VPS verifier, then deployed to production 38 as `20260803-075434-a65767384c1b` after a zero-active-work preflight and validated root-only PostgreSQL backup. Manifest/image/container identity, app/PostgreSQL health, Nginx/public HTTPS, Open WebUI identity, routes/auth boundaries, required schema, workers, six named volumes, and retained rollback passed without provider or external-write calls.
Older evidence is preserved in `.trellis/spec/fluxpost/archive/verification-history.md`.

## Missing Coverage

- No live paid Seedance, GPT image/text, TikHub, ComfyUI, Feishu, or Lark action is part of the default baseline.
- No local Canvas history, media, account, or configuration migration was performed.
- No authenticated production Canvas create/save/run walkthrough or multi-user PostgreSQL concurrency test was run during this release.
- No default check changes DNS, firewall, Nginx routing, Docker volumes, or external production services.
- No production image cleanup or systemd timer change is performed by the default baseline; the 2026-08-06 live maintenance evidence was an explicitly authorized operator action.
- The package audit reports eight high-severity transitive advisories; do not run automatic `npm audit fix --force` as part of release verification.

## Future Check Rules

- Add baseline checks only when deterministic, isolated, and non-mutating.
- Record live external checks as manual operator gates.
- A candidate SHA change invalidates previous release evidence.
- Keep recent verification to five entries and archive older detail.
- Never weaken a failing check to make the baseline pass; isolate a demonstrably unchanged blocker and run the remaining checks explicitly.
- Source-text checks that match function boundaries must accept both LF and CRLF so fresh Windows worktrees exercise the same assertions as Git archives and Linux candidates.
