# Verification — 2026-11-04

## Passed
- Full baseline: `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`. Includes deterministic contracts, lint (0 errors / 16 preexisting warnings), TypeScript, production build, HTTP smoke and SQLite validation. Log: ignored `test-artifacts/batch-favorites-baseline.log`.
- `node .trellis/verification/canvas_schedule_favorites_check.mjs`: actual SQLite, 160 schedules; access before pagination, literal wildcard search, count/pages, light projections, metadata CRUD/persistence, personal/admin isolation, schema parity, API 400/401/404, worker independence, revision independence and cascading deletion.
- `node --env-file=.env.local .trellis/verification/canvas_schedule_favorites_check.mjs --postgres`: same checks in a unique disposable loopback PostgreSQL schema, removed in finally. No application records changed.
- Scheduler regression: existing real duplicate action retains latest text, inner bindings, random ranges, directory and workbook snapshots, shared outputs; new draft has no runtime/preview/snapshot; independent edits cannot mutate source. Included in baseline.
- `python .trellis/verification/batch_favorites_browser_check.py`: six professional/editorial/creator × 1440/390 cases. Covers favorite-first entry, latest-source copying, dirty save before copy, alias/note reload, unavailable workflow, filtering, paging, Enter search, stale request cancellation, cross-instance state, delete prompt/cleanup, read failure/retry, V1 copy and original-center favorite. Log: ignored `test-artifacts/batch-favorites-browser.log`; screenshots `batch-favorites-{theme}-{width}.png`.
- `python .trellis/verification/batch_create_browser_check.py`: six original wizard/result/legacy-center flows plus all eleven input types, workbook/inner/shared/range roundtrip. Log: ignored `test-artifacts/batch-favorites-original-browser.log`.
- `git diff --check` passes. Startup/code context budgets pass without changing limits; existing historical status summaries compressed with evidence references preserved.

## Review notes
- V1 full-page navigation reproduced repeated reloads; Next router navigation without an intermediate source URL rewrite passes all six browser cases.
- Favorite pages omit the workflow-only Next button. First step is named “选择配置”.
- Shared favorite metadata never touches the scheduler revision; both pages use one control and synchronize updates locally. Summary/favorite reads never reconcile or wake workers.
- All browser APIs/media intercepted on worker-disabled loopback port 45678. No paid models, live Feishu writes, production services or port-3001 changes.

## Delivery state
Implementation and verification complete; operator usability acceptance remains. User confirmed commit and LAN activation on 2026-11-05. Prior isolated verification remains valid; commit/archive and clean-HEAD LAN build/identity/health verification follow. Remote deployment is out of scope.

Preexisting work excluded: the Nov 4 afternoon-interruption addition in `status.md` and `.trellis/tasks/archive/2026-11/11-04-local-afternoon-exit/`. Recorded separately in documentation commit 707442c before the feature commit, to satisfy the authorized LAN clean-tree gate.

## Authorized LAN release — 2026-11-05

User requested commit and LAN update. Release baseline repeated with `TRELLIS_SMOKE_PORT=45678`; log: ignored `test-artifacts/batch-favorites-release-baseline-20261105.log`. Previous live candidate: 48a5ccc5966c24518d83636bf60b8b034a863445.

Activation uses only `npm run local:lan` from clean committed primary HEAD, then loopback/LAN identity and `/batch-create` HTTP checks. Release/diagnostics receipts hold the activated full SHA and slot; output: ignored `test-artifacts/batch-favorites-lan-20261105.log`. No remote push/deployment or paid acceptance.
