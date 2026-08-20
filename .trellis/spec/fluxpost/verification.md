# Verification

Last updated: 2026-08-20

## Baseline Command

Run the cross-platform deterministic baseline before claiming code completion:

```powershell
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

`.trellis/verification/check.ps1` wraps `.trellis/verification/check.mjs`. Its isolated smoke server disables workers on a private test port; the port-3001 versioned candidate retains normal worker behavior.

## Current Automated Checks

The baseline verifies:

- Trellis file existence, context budgets, latest markers, JSON validity, and feature evidence limits.
- PostgreSQL schema, accounts/ownership, libraries, configuration, TOS, v4 deployment/image-retention/timer scripts, execution logs, platform mappings, media, video, concurrency, queues, Feishu boundaries, source imports, review flows, and row-level persistence.
- Infinite Canvas graph/API/DAG, common nodes, subtitle FFmpeg/presets, media, provider resume, scheduler, copy-library, and original-batch contracts without paid calls.
- Canvas local video-loader snapshot, streaming upload/FFprobe, selected-literal output, frozen V2 queue, and single-video task contracts without external storage calls.
- Finished-body Unicode counting, 800-target prompts, one-repair fallback, history promotion, persistence consistency, editor clamping, Canvas composition, and Feishu exemptions without paid calls.
- Runtime identity/secrecy, manifest-derived activation identity, candidate-only local startup, loopback/LAN bindings, and parity command contracts.
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

- 2026-08-20: Clean committed SHA `0909776383c05eab37a2f66a0b2443dde693e2da` activated on both managed slots; a controlled inactive-slot missing-`BUILD_ID` failure restored the prior slot, identity, state marker, and full HTTP smoke before final healthy activation on `.next-local-b`.
- 2026-08-20: Local A/B build-slot allow-list, primary-worktree/clean-tree ordering, SHA markers, atomic state and rollback contracts, both real slot builds without TypeScript config churn, lint, TypeScript, isolated HTTP/SQLite smoke, and the complete offline baseline passed while port 3001 remained on its prior candidate.
- 2026-08-20: Canvas scheduler search/thumbnail checks covered 350 ms debounce, stale 24-item grids, explicit paging, ID-only select-all, original previews, 240x144 WebP cache/auth/concurrency/atomic/prewarm contracts, mocked Chromium 1440x960/390x844, and the full offline baseline without external writes.
- 2026-08-20: Explicit local thumbnail prewarm processed 437 assets with zero failures into 435 SHA-deduplicated files (1,938,318 bytes); the second run generated zero and skipped all 437 cached assets.
- 2026-08-20: Canvas video-loader MP4/MOV/WebM and failure cleanup checks used local FFmpeg/FFprobe with mocked persistence; workflow/scheduler, mocked Chromium 1440x900/390x844, lint, TypeScript, build, smoke, and the full offline baseline passed.
Older evidence is preserved in `.trellis/spec/fluxpost/archive/verification-history.md`.

## Missing Coverage

- No live paid Ark subtitle/Seedance, GPT image/text, TikHub, ComfyUI, Feishu, or Lark action is part of the default baseline.
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
