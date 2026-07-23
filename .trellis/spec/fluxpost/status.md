# Trellis Status

Last updated: 2026-07-23

## One-Line Status

Reference and vehicle libraries are live on production 38 at verified application SHA `542cbb5e2d1f49539393a7d51a798b7e9e0ff18f`; GitHub `main` and staging 104 use the same application commit.

## Current Focus

- Candidate `542cbb5e2d1f49539393a7d51a798b7e9e0ff18f` passed the 104 Docker verifier with a full-SHA manifest, then ran as release `20260723-035052-542cbb5e2d1f`; the operator confirmed the isolated library functional scenarios passed.
- GitHub `main` was fast-forwarded without merge, rebase, amend, or application-SHA change.
- Production 38 runs release `20260723-113938-542cbb5e2d1f`. Manifest, immutable image, running container image, app/PostgreSQL health, Nginx, loopback/public HTTPS, `/library`, six FluxPost volumes, database rollback-write smoke, and library schema checks pass.
- Production queue checks found no queued or running simple, image, Feishu, distribution, or library-tagging work before or after activation.
- Co-located Open WebUI retained container id `8b4001fa8181d9a94646eac07b502444abf06369d1687d484794ecfebfbf638e` and remained healthy. TLS verification remains enabled; production TOS and OpenAI status checks remain configured without exposing credentials.
- Production 38 uses Nginx for `flux.lightmoment.net`, loopback app port 3101, persistent FluxPost volumes, and Ubuntu 22.04. Use the installed deploy wrapper rather than fresh bootstrap.
- `/config` remains admin-only. Operator base secrets stay in `shared/env.production`; admin overrides stay in the persistent `fluxpost-config` volume.

## Next Entry

1. Use the production `/library?role=reference` and `/library?role=vehicle` views for normal operator work; investigate only concrete failures rather than repeating paid live probes by default.
2. Keep documentation-only evidence commits out of the deployed application SHA; a later code change must restart the full 104 gate.
3. For future fixes, start from a clean `origin/main` worktree, push the final candidate, and repeat the same immutable 104-to-38 promotion sequence.

## Recent Verification

- 2026-07-23: Candidate `542cbb5e` passed the 104 full Docker verifier and immutable release checks; the operator confirmed isolated TOS/GPT/delete and reference/vehicle functional scenarios passed. The unchanged SHA then deployed to production release `20260723-113938-542cbb5e2d1f` with all identity, health, persistence, schema, queue, HTTPS, Nginx, and Open WebUI checks passing.
- Older verification evidence is preserved in `.trellis/spec/fluxpost/verification.md` and `.trellis/spec/fluxpost/archive/verification-history.md`.

## Current Risks

- Documentation evidence may make GitHub `main` newer than the deployed application SHA. Do not deploy a documentation-only commit; the next code candidate must pass the 104 gate as a new full SHA.
- Candidate verification must not read environment files, mount named volumes, invoke Compose, change `current`, or call paid/live providers.
- Never copy production accounts, database data, media, TOS prefixes, Feishu targets, provider credentials, or Docker volumes to 104.
- Production-only integration probes require separate operator approval and must be minimal, observable, and reversible.
- Do not expose `.env*`, database credentials, API keys, Feishu/Lark tokens, local passwords, or real user identifiers in commands, Git, Trellis, logs, or responses.
- Do not remove `fluxpost-config`, PostgreSQL, data, media, node-home, or proxy certificate volumes during deploy or rollback.
- `@volcengine/tos-sdk@2.9.1` retains upstream Axios advisories; keep TLS verification enabled and configuration admin-only.

## Necessary History Paths

- Handoff history: `.trellis/spec/fluxpost/archive/handoff-history-2026-06-17.md`
- Progress history: `.trellis/spec/fluxpost/archive/progress-history-2026-06-17.md`
- Verification history: `.trellis/spec/fluxpost/archive/verification-history.md`
- Feature evidence history: `.trellis/spec/fluxpost/archive/feature-list-history-2026-06-17.json`
- Previous pitfalls: `.trellis/spec/fluxpost/archive/pitfalls-history-2026-06-17.md`
- Previous architecture rules: `.trellis/spec/fluxpost/archive/architecture-rules-history-2026-06-17.md`

## Handoff Minimum Standard

After reading `AGENTS.md`, this file, `feature_list.json`, and `rules.md`, a new session must know the current task, next command boundary, required remote evidence, and prohibited production/staging actions. Keep this file lightweight; move detailed logs to verification history or the active task research directory.
