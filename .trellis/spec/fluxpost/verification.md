# Verification

Last updated: 2026-11-02

## Baseline Command

Run the cross-platform deterministic baseline before claiming code completion:

```powershell
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

`check.ps1` wraps `check.mjs`. Smoke disables workers on a private test port; port 3001 keeps workers enabled.

ESLint excludes `data/**` runtime data and local operator artifacts, matching the
project's source/data boundary. Application source and maintained scripts remain
checked with unchanged rules; Git ignore rules alone do not exclude ESLint inputs.

The large PostgreSQL acceptance benchmark is intentionally separate from the default baseline because it creates one million temporary relation rows. It only accepts loopback PostgreSQL by default, creates a unique schema, and drops that schema in `finally`:

```powershell
node --env-file=.env.local .trellis/verification/unified_library_postgres_benchmark.mjs
```

## Current Automated Checks

The executable offline coverage list is `.trellis/verification/check.mjs`.
Detailed existing coverage and isolated browser commands are preserved in
`archive/verification-coverage-2026-10-30.md`.

Review usability adds `review_usability_check.mjs` (pure calendar/validation,
isolated SQLite scope/queries and image-order persistence), extends
`review_postgres_benchmark.mjs` in a disposable loopback schema, and adds
`python .trellis/verification/review_usability_browser_check.py`. Browser checks
require worker-disabled loopback `BROWSER_BASE_URL`, reject 3001 and intercept
all API/media requests. Existing review performance/browser regressions remain.

Default checks never call paid models, production services, or real Feishu writes.

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

- 2026-11-02 Content-pool libraries: SQLite, browser, types, lint, build and
  baseline pass; PostgreSQL review remains.

- 2026-11-02 Review gallery drag regression: the image fieldset disables only
  under the media lock, and regenerate joins up/down/delete as disabled during
  drag. Headed Chrome real-mouse drag, the 45-case three-theme suite and the
  153-step baseline pass. Logs: `test-artifacts/review-gallery-drag-*.log`.

- 2026-11-02 Review image preview 3:4: image tiles use 3:4 (video 4:3),
  the first-image `16 / 9` hero is removed, the 112px desktop grid keeps four
  portrait images visible at 1440x900, and badge/tools geometry is verified for
  image and video tiles. Full baseline (0 lint errors/16 warnings), 45
  three-theme layout cases, video/series/scrollbar/interaction checks and two
  performance runs pass. Committed `0428b64` and activated on LAN; `/review`
  returns 200 on loopback and LAN. Logs: `test-artifacts/review-ratio-*.log`.

- 2026-11-02 Review desk usability: exact-tree baseline (153 logged steps, 0 lint errors,
  16 existing warnings, types/build/config sync/HTTP smoke on 45678/SQLite),
  opt-in isolated PostgreSQL filters/save/reorder, three-theme 30-case browser
  suite and review performance regressions pass. Clean-tree `npm run local:lan`
  activated the committed candidate into `.next-local-b` on `0.0.0.0:3001`:
  build, candidate identity, HTTP smoke and `/review` 200 on loopback and LAN
  passed; the receipt records the active SHA. Post-verification audit fixes
  (prompt preservation, async slot identity, series media ownership, shared media
  lock, dragleave, invalid-filter rows, batch trigger, summary labels, asOf reuse)
  re-ran the full baseline, isolated PostgreSQL benchmark and both browser suites
  on the final tree. Real authenticated operator review remains. Logs:
  `test-artifacts/review-usability-*-final.log`,
  `test-artifacts/review-usability-*-fixes*.log`,
  `test-artifacts/review-usability-baseline-final-audit.log`.

- 2026-10-30 ESLint scope: excluded `data/**` operator artifacts only. Lint passes
  with 0 errors/16 source warnings; ESLint API assertions confirm source/config
  and maintained scripts remain checked with the require-import rule at error.
  Full baseline passes, including types/build/config sync/HTTP smoke on 45678 and
  SQLite checks. LAN unchanged. Local log: `test-artifacts/lint-scope-baseline-20261030.log`.

- 2026-10-28 Wonder repair: baseline domains pass before 17 existing data-script lint errors; focused lint/types/build/config/SQLite/HTTP and six Wonder plus two GPT browser cases pass. Explicitly authorized LAN activation of clean `3f71997` passed build/identity/loopback/LAN HTTP/Canvas checks. No manual paid replay. Evidence: archived wonder-image-repair task.

Prior text-reasoning and local-library acceptance entries are preserved in
`archive/verification-history.md` (2026-10-28 context-budget archive). Current
OSS evidence: `.trellis/tasks/archive/2026-10/10-28-oss-acceptance-local-cutover/verification.md`.

## Missing Coverage

- Default checks use isolated fixtures: no paid providers, real Feishu/Lark writes,
  production configuration/data, external infrastructure changes or image cleanup.
- Real migrations, authenticated runtime walkthroughs, PostgreSQL multi-user load,
  and local/GitHub/production parity need separate dated operator evidence.
- A fresh dependency audit is separate; historical advisory counts are not current
  guarantees. Never run automatic `npm audit fix --force` during verification.
- Current local OSS acceptance and remaining cutover gates are in the active
  oss-acceptance-local-cutover task; older coverage notes remain in the archive.

## Future Check Rules

- Add baseline checks only when deterministic, isolated, and non-mutating.
- Record live external checks as manual operator gates.
- A candidate SHA change invalidates previous release evidence.
- Keep recent verification to five entries and archive older detail.
- Never weaken a failing check to make the baseline pass; isolate a demonstrably unchanged blocker and run the remaining checks explicitly.
- Source-text checks that match function boundaries must accept both LF and CRLF so fresh Windows worktrees exercise the same assertions as Git archives and Linux candidates.
