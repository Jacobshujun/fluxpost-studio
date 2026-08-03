# Deploy Production Release a657673

## Goal

Deploy the exact approved commit `a65767384c1b1993c95c8c32d053edcd10c3fac6` to the supported FluxPost production host `38.76.210.136` and make it the release served at `https://flux.lightmoment.net`, while preserving production data, configuration, media, networking, and unrelated VPS services.

## Background

- Production currently serves release `20260729-061224-d05caddb1787` at exact commit `d05caddb17875bb9a5dde924f9e4e8654f8d3ee3`.
- The approved candidate is the current head of `origin/release/production-20260803`; `git ls-remote` resolves that branch to the exact approved SHA.
- Repository evidence records that this candidate passed focused checks, the complete local baseline, candidate-path and secret review, and an isolated clean-archive VPS baseline without external provider calls or service activation.
- The candidate contains the combined Canvas, shared-library, and `/original` work plus restored deployment wrapper v3, verifier v1, shared operation lock, Docker verification target, Linux-complete dependency lock, and archive-safe deployment fixtures.
- Production 38 runs Ubuntu 22.04 and must use its installed release wrapper. A fresh bootstrap is forbidden.
- The local worktree contains unrelated untracked screenshots. They are not part of the pushed commit and must not be staged, uploaded, or otherwise included in deployment.

## Requirements

- Promote only the exact 40-character SHA `a65767384c1b1993c95c8c32d053edcd10c3fac6`; do not deploy a branch name, abbreviated SHA, dirty archive, or local runtime state.
- Use only `/opt/fluxpost-studio/bin/verify-candidate.sh` and `/opt/fluxpost-studio/bin/deploy.sh` on `38.76.210.136`.
- Before activation, require the deterministic local baseline, an isolated commit-bound VPS verification manifest, and a read-only production preflight.
- The preflight must capture the active release/manifest/image, FluxPost app and PostgreSQL health, loopback and public HTTPS health, Nginx and protected-service state, disk headroom, named-volume inventory, and retained rollback release.
- Do not activate while FluxPost has active provider, generation, publish, or workflow jobs whose interruption could duplicate or lose work. An ambiguous queue or runtime state is a stop condition.
- Because the candidate adds PostgreSQL schema, create a root-only production database backup before activation and verify that the backup artifact is non-empty. Do not copy backup contents into Git or Trellis.
- Preserve PostgreSQL, `fluxpost-config`, data, generated media, crawled media, node-home, and all other named volumes. Preserve app port 3101 as loopback-only, host Nginx, `https://flux.lightmoment.net`, Open WebUI, and unrelated services.
- Do not read, print, copy, or modify production secrets. Do not call paid providers, Feishu/Lark writes, TikHub, ComfyUI, or live generation workflows as deployment checks.
- If wrapper activation health fails, rely on its automatic rollback. If a required post-deploy check fails after activation, use manifest-aware rollback to the captured prior release and verify recovery.

## Acceptance Criteria

- [x] Local deterministic baseline passes at the approved commit without external production calls.
- [x] The GitHub remote still resolves the candidate branch to the approved full SHA immediately before remote verification.
- [x] `/opt/fluxpost-studio/bin/verify-candidate.sh --ref <sha>` succeeds and produces a passing manifest bound to the approved SHA.
- [x] Production preflight is healthy and unambiguous, with sufficient disk, no unsafe active work, a captured rollback release, stable protected services, and unchanged named-volume inventory.
- [x] A non-empty root-only PostgreSQL backup is created before activation.
- [x] `/opt/fluxpost-studio/bin/deploy.sh --ref <sha>` completes successfully without manual server edits or volume replacement.
- [x] Active release manifest, immutable image tag, and running app container all identify the approved SHA.
- [x] App and PostgreSQL are healthy; loopback `/api/config`, public HTTPS, Nginx, and Open WebUI remain healthy.
- [x] `/canvas`, `/copy-library`, `/library`, and `/original` return HTTP 200; representative unsigned protected APIs return HTTP 401.
- [x] Required additive PostgreSQL tables are present, normal background workers are enabled, prior release remains retained, and named volumes match the preflight inventory.
- [x] No paid provider, Feishu/Lark write, production data import, DNS/Nginx/firewall change, global Docker prune, or volume deletion occurs.
- [x] Trellis status records either the successful production release identity or the verified rollback outcome.

## Out Of Scope

- Fast-forwarding or changing `main`.
- Importing local accounts, Canvas history, generated posts, configuration, media, or other runtime state.
- Running the operator-only real `/original` smoke or any paid/authenticated generation workflow.
- Changing DNS, Nginx routing, SSH, firewall, Docker daemon, host swap, or unrelated services.
- Retiring old hosts or cleaning the unrelated `bbs.vollov1.xyz` DNS record.
