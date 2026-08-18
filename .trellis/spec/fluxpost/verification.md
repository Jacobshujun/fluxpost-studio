# Verification

Last updated: 2026-08-14

## Baseline Command

Run the cross-platform deterministic baseline before claiming code completion:

```powershell
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

`.trellis/verification/check.ps1` wraps `.trellis/verification/check.mjs`. Its isolated smoke server and port-3001 development disable workers by default; versioned runtimes retain normal worker behavior.

## Current Automated Checks

The baseline verifies:

- Trellis file existence, context budgets, latest markers, JSON validity, and feature evidence limits.
- PostgreSQL schema, accounts/ownership, libraries, configuration, TOS, v4 deployment/image-retention/timer scripts, execution logs, platform mappings, media, video, concurrency, queues, Feishu boundaries, source imports, review flows, and row-level persistence.
- Infinite Canvas graph/workflow/API/DAG, common nodes, media helpers, provider resume, scheduler, frozen copy input, copy-library, and original-batch contracts without paid calls.
- Runtime identity/secrecy, manifest-derived activation identity, single-candidate startup, development defaults, and parity command contracts.
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
8. Require `npm run local:parity` to prove the clean local candidate, GitHub `main`, and production all use the deployed SHA.

Do not deploy a dirty worktree, branch name, abbreviated SHA, local runtime rows, or unpushed commit.

## Recent Verification

- 2026-08-17: Dongchedi current/legacy path fixtures, empty-page Cookie error, import checks, lint, TypeScript, build, and offline baseline passed; Playwright was diagnostic-only.
- 2026-08-17: Dongchedi category guards, serial drafts, pause/resume, Cookie secrecy, partial completion, full offline baseline, and unauthenticated desktop/mobile smoke passed without external calls.
- 2026-08-17: Exact-SHA local/VPS baselines, clean port-3001 candidate, GitHub main, production identity/health/schema, unchanged six FluxPost volumes and protected services, logs, timer, rescue tags, branch/worktree cleanup, and final three-way parity passed without external provider writes.
- 2026-08-17: Single-port candidate contracts, PowerShell parsing, runtime/deployment checks, lint, TypeScript, build, isolated HTTP/SQLite smoke, and the complete deterministic baseline passed without external calls; exact candidate startup and rollout remain pending.
- 2026-08-18: Feishu full/text/media mode contracts, field isolation, queue/Canvas compatibility, complete offline baseline, and responsive UI screenshots passed without external writes.
Older evidence is preserved in `.trellis/spec/fluxpost/archive/verification-history.md`.

## Missing Coverage

- No live paid Seedance, GPT image/text, TikHub, ComfyUI, Feishu, or Lark action is part of the default baseline.
- No local Canvas history, media, account, or configuration migration was performed.
- No authenticated production Canvas create/save/run walkthrough or multi-user PostgreSQL concurrency test was run during this release.
- No default check changes DNS, firewall, Nginx routing, Docker volumes, or external production services.
- No production image cleanup or systemd timer change is performed by the default baseline; the 2026-08-06 live maintenance evidence was an explicitly authorized operator action.
- Current production lacks `/api/version`; final parity awaits an approved identity-enabled deployment.
- The package audit reports eight high-severity transitive advisories; do not run automatic `npm audit fix --force` as part of release verification.

## Future Check Rules

- Add baseline checks only when deterministic, isolated, and non-mutating.
- Record live external checks as manual operator gates.
- A candidate SHA change invalidates previous release evidence.
- Keep recent verification to five entries and archive older detail.
- Never weaken a failing check to make the baseline pass; isolate a demonstrably unchanged blocker and run the remaining checks explicitly.
- Source-text checks that match function boundaries must accept both LF and CRLF so fresh Windows worktrees exercise the same assertions as Git archives and Linux candidates.
