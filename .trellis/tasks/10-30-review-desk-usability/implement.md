# Review Desk Execution Plan

## Planning Gate

- [x] Parent and children created with consent, all in planning.
- [x] Requirements, evidence and sequential ownership recorded.
- [x] User confirmed free insertion for all cards; no fixed missing-card slots.
- [x] User approved implementation, commits and LAN activation.
- [x] Loaded `trellis-before-dev` and applicable frontend/project specs.
- [x] Started each implementation child sequentially; parent owns integration.

Codex defaults to inline; no agents or curated JSONL context are needed. Creation
is not implementation approval.

## Sequence

1. Implement/verify layout and stable overlay/action placement.
2. Implement/verify ordering, prompt persistence and cover-reference guards.
3. Filters: types/calendar -> SQL/API -> URL/Hook -> overlay, each with tests.
4. Combined browser regressions: unsaved order plus filter/history changes,
   pending saves/candidate switches, approval and publishing payload order.
5. Run full baseline; record actual results and residual gaps.
6. Update status/feature state only from verified outcomes, preserving existing
   edits. Planning is not feature-completion evidence.
7. Commit/candidate actions remain separately authorized; 3001 stays unchanged
   until verified committed work is explicitly activated.

## Existing Verification Commands

```powershell
node .trellis/verification/review_desk_scroll_layout_check.mjs
node .trellis/verification/review_preview_layout_check.mjs
node .trellis/verification/review_desk_workflow_check.mjs
node .trellis/verification/review_performance_check.mjs
npx --no-install tsx .trellis/verification/review_performance_benchmark.ts
node --env-file=.env.local .trellis/verification/review_postgres_benchmark.mjs
$env:BROWSER_BASE_URL = "http://127.0.0.1:45678"
python .trellis/verification/review_performance_browser_check.py
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

PostgreSQL is opt-in, local-only, unique-schema isolated; never print credentials.
Browser command requires an existing worker-disabled isolated test server, not
the candidate. Read existing test-server setup before launching. Extend existing
checks or register real deterministic additions in `check.mjs`; do not weaken
checks merely to accept changed behavior.

## Evidence Status

Implementation completed. Final exact-tree baseline, PostgreSQL rerun and both
browser suites passed; evidence and logs are recorded in `verification.md`.
Commit and LAN identity are recorded after the clean-tree activation. Planning
artifact validation passed on 2026-10-30; no result is inferred from unchecked
plan items.
