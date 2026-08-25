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
3. Push a dedicated branch and verify the remote full SHA.
4. Run `/opt/fluxpost-studio/bin/verify-candidate.sh --ref FULL_40_CHARACTER_SHA` and require a commit-bound passing manifest before approval; this isolated gate must not read production configuration, mount runtime volumes, or activate services.
5. Run read-only production preflight.
6. Deploy only through `/opt/fluxpost-studio/bin/deploy.sh --ref FULL_40_CHARACTER_SHA` after separate explicit approval.
7. Verify identity, health, protected services, schema/auth, unchanged volumes, image-retention preview/results, two rescue tags, and the weekly BuildKit timer.
8. Require `npm run local:parity` to prove the clean local candidate, GitHub `main`, and production all use the deployed SHA.

Do not deploy a dirty worktree, branch name, abbreviated SHA, local runtime rows, or unpushed commit.

## Recent Verification

- 2026-08-25: Clean competitor-workbook candidate activated on port 3001 with matching identity and HTTP smoke; mocked Chromium at 1440x960 and 390x844 verified the five-node/six-edge preset, workbook editor, hierarchical scheduler fields, concurrency 1-5, disabled preflight launch, and no horizontal overflow without provider calls.
- 2026-08-24: Competitor-workbook 200-row/778-card parsing, invalid-input/path-redaction boundaries, hierarchy, shared references, progressive concurrency, retry/partial-draft sync, GPT V2 compatibility, TypeScript, lint, build, isolated smoke, and full baseline passed without live providers or Feishu.
- 2026-08-21: Clean `b672f9a577b4f981b9cb3d4a80527af795a49c95` activated on loopback port 3001 with matching `/api/version` identity and `/canvas` HTTP 200. An isolated authenticated browser used the same candidate and real PostgreSQL to create, update to revision 2, refresh, and read back an incomplete draft; cleanup left zero fixture workflows, sessions, and accounts.
- 2026-08-21: Canvas draft persistence now separates structural save validation from execution readiness; isolated SQLite create/update/read/delete, malformed-config rejection, Canvas focused checks, TypeScript, lint, build, and the full offline baseline passed.
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
