# Verification

Last updated: 2026-08-25

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
- Infinite Canvas graph/API/DAG, incomplete-draft persistence, execution readiness, common nodes, competitor-workbook parsing/redaction/hierarchical scheduling, subtitle recognition/render/revision/waveform/cache contracts, media, provider resume, scheduler, copy-library, and original-batch behavior without paid calls.
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
3. Push the unchanged verified commit, merge it to `origin/main`, and verify the remote full SHA before candidate verification; a temporary branch is optional, but production parity is always against `origin/main`.
4. Run `/opt/fluxpost-studio/bin/verify-candidate.sh --ref FULL_40_CHARACTER_SHA` and require a commit-bound passing manifest before approval; this isolated gate must not read production configuration, mount runtime volumes, or activate services.
5. Run read-only production preflight.
6. Deploy only through `/opt/fluxpost-studio/bin/deploy.sh --ref FULL_40_CHARACTER_SHA` after separate explicit approval.
7. Verify identity, health, protected services, schema/auth, unchanged volumes, image-retention preview/results, two rescue tags, and the weekly BuildKit timer.
8. Require `npm run local:parity` to prove the clean local candidate, GitHub `main`, and production all use the deployed SHA.

Do not deploy a dirty worktree, branch name, abbreviated SHA, local runtime rows, or unpushed commit.

## Recent Verification

- 2026-08-27: Content-pool manual custom tags now remain separate from fixed AI categories and support owner-scoped suggestions, normalized search, AND filters, single editing, partial-success batch add/remove with per-item errors, and shared normal/V2 Canvas filtering. Focused checks, TypeScript, lint (0 errors, 5 existing Canvas warnings), production build, isolated HTTP smoke, SQLite, the full offline baseline, and mocked Chromium at 1440x960 and 390x844 passed without external calls.
- 2026-08-26: Canvas content-pool selection now supports owner-scoped search/project/platform/status/media/tag/local-complete filters, stable cursor paging, compact snapshots, and V2 manual/match fixed/each/random main-task expansion with explicit missing-ID and 200-item limits. Focused checks, TypeScript, lint (0 errors, 5 existing Canvas warnings), production build, isolated smoke, SQLite, and the full offline baseline passed without external calls; mocked Chromium at 1440x960 and 390x844 passed selection, preview, pagination, bulk modes, focus-native controls, and overflow checks on clean candidate `2b3f94b22e118699f82da595d246b901977ea0dc`.
- 2026-08-26: Library batch multi-collection add/create/remove, target-first validation, partial permissions, stable relationship updates, and 65-item cursor selection retention passed focused domain checks, TypeScript, lint (0 errors, 5 existing Canvas warnings), production build, isolated HTTP smoke, SQLite, and the full offline baseline without external calls. Clean SHA `5f1cb7c11a69cfce763175ac36e5a192ca251c83` activated on loopback port `3001`; mocked system Chrome at 1440x960 and 390x844 passed against that candidate without live services.
- 2026-08-26: V2 Canvas partial child/row retry now targets only `model.gpt-image-each` attempts with failed child metadata, preserves the existing review draft, and leaves V1/shared/generic partial tasks non-retryable. Focused checks and the full offline baseline passed without external calls; clean SHA `e58b37b0767da79ea365c214945755a0e8a0c16b` passed the isolated VPS verifier, deployed as `20260826-094620-e58b37b0767d`, and reached exact parity across local LAN port `3001`, GitHub `main`, and production. Post-deploy identity, app/PostgreSQL/Nginx/public health, loopback binding, 16 zero-active-work checks, persistent volumes, protected services, retained rollback/rescue images, and the weekly BuildKit timer passed without provider or Feishu/Lark writes.
- 2026-08-26: Trellis reconciliation reduced legacy active tasks from 29 to 0 after cleanup and default startup context from 45,129 bytes to 24,962 bytes; no active/archive duplicates or orphan task directories remain. JSON, context/marker budgets, all focused checks, TypeScript, lint (0 errors, 5 existing warnings), production build, isolated HTTP smoke, SQLite, and the full offline baseline passed without external production calls.
Older evidence is preserved in `.trellis/spec/fluxpost/archive/verification-history.md`.

## Missing Coverage

- No live paid Ark plain-text transcription, Seedance, GPT image/text, TikHub, ComfyUI, Feishu, or Lark action is part of the default baseline. Canvas subtitle timing is local Faster Whisper and was verified separately against one recent local input.
- No local Canvas history, media, account, or configuration migration was performed.
- No authenticated production Canvas create/save/run walkthrough or multi-user PostgreSQL concurrency test was run during this release.
- No default check changes DNS, firewall, Nginx routing, Docker volumes, or external production services.
- No production image cleanup or systemd timer change is performed by the default baseline; the 2026-08-06 live maintenance evidence was an explicitly authorized operator action.
- Current production lacks `/api/version`; final parity awaits an approved identity-enabled deployment.
- The package audit reports nine high-severity transitive advisories; do not run automatic `npm audit fix --force` as part of release verification.

## Future Check Rules

- Add baseline checks only when deterministic, isolated, and non-mutating.
- Record live external checks as manual operator gates.
- A candidate SHA change invalidates previous release evidence.
- Keep recent verification to five entries and archive older detail.
- Never weaken a failing check to make the baseline pass; isolate a demonstrably unchanged blocker and run the remaining checks explicitly.
- Source-text checks that match function boundaries must accept both LF and CRLF so fresh Windows worktrees exercise the same assertions as Git archives and Linux candidates.
