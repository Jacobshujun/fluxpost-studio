# Review Desk Verification

Date: 2026-10-30. Scope: layout, free image/card ordering, strict structured
filters and Beijing calendar rules. User authorized implementation, commits and
LAN activation; no remote production release or paid/provider write tests.

## Focused Evidence

- `node .trellis/verification/review_usability_check.mjs`: passed pure calendar,
  invalid/depth/count contracts, exact vehicle matching, literal substring and
  null/empty/negation behavior, owner/batch OR isolation, SQLite queries and real
  ordinary prompt/order save/reload. Host TZ is America/Los_Angeles deliberately.
- `node .trellis/verification/review_performance_check.mjs`: existing isolated
  pagination, compact rows, source concurrency, thumbnail and patch tests pass;
  extended with server cursor clock retention when clients omit `asOf`.
- `node --env-file=.env.local .trellis/verification/review_postgres_benchmark.mjs`:
  actual production query/save functions in a unique loopback schema; cleanup in
  finally. New shared filter fixtures and prompt API save/reject/reload pass.
  10k-row compact page is 16,382 bytes; latest pre-final manual-save P95 1.89 ms,
  approval-with-edit P95 1.78 ms. These are fixture measurements, not LAN promises.
- Review workflow, preview and scroll-layout checks pass after replacing obsolete
  1120px/unified-page assumptions with current contracts. Source-video and route
  persistence checks now inspect shared patch/atomic URL contracts, not removed
  duplicate declarations.
- Original-card orchestrator mock checks now cover a semantic cover placed last,
  including worker resumption. Cover still generates first without references;
  content uses its image without changing review order. No models were called.

## Browser Evidence

Worker-disabled Next service on loopback 45678, never 3001. All API/media calls
intercepted. Chrome headless with synthetic fixtures; screenshots visually checked.

- `python .trellis/verification/review_usability_browser_check.py`: three themes
  at 1280x720, 1440x800, 1512x982, 1920x1080, 390x844, 1280x480 and
  959/960/1599/1600 breakpoint cases: 30 layout cases pass. Full laptop card,
  list scroll, no page horizontal overflow, short-height page scroll, reachable
  expanded AI/actions, dialog sizing/Escape/focus and batch drawer checked.
  Final rerun on the exact built tree: exit 0, 30/30 cases and interactions pass.
- Real mouse handle drag plus edge autoscroll passes insertion across duplicate
  URLs; cancel preserves order. Up/down, prompt save/reload, pending-upload lock,
  missing-card move/regeneration, candidate switching and cover role retention
  pass. Panel cancel, invalid/repaired date range, subgroup vehicle selection,
  clear-all URL, back/forward and unsaved body/order preservation pass.
- `python .trellis/verification/review_performance_browser_check.py`: existing
  1440/390 tests pass with 1k/10k fixtures: stale list/detail/save races, newer
  typing retained, failed save retained, selection/page limits, publishing payload
  inspection and replacement previews. No real publication. Final rerun exit 0;
  input/click P95 13.2-14.9 ms.
- Logs: `test-artifacts/review-usability-browser-final.log`,
  `test-artifacts/review-usability-performance-browser-final.log`. Screenshots:
  `test-artifacts/review-usability/` (synthetic/local, not committed).

## Integration Gate

Final exact-tree baseline passed on 2026-11-02: 153 logged steps, 0 lint errors,
16 existing source warnings, TypeScript/build/built-config sync, HTTP smoke on
127.0.0.1:45678 and SQLite checks. Log:
`test-artifacts/review-usability-baseline-final.log`; exit code 0.

Opt-in PostgreSQL rerun on the same tree passed in a unique disposable loopback
schema, including shared filter fixtures, prompt save/reject/reload, real
ordinary/structured list and save functions. 10k-row compact page 16,382 bytes;
manual save P95 1.92 ms; approval-with-edit P95 1.95 ms; 50-predicate structured
list P95 6.18 ms. Log: `test-artifacts/review-usability-postgres-final.log`.

Initial gate failures were fixed, not bypassed: startup context exceeded 70 KB,
so existing detailed verification coverage was preserved verbatim in
`.trellis/spec/fluxpost/archive/verification-coverage-2026-10-30.md`; old structural
tests were updated for the shared patch type, atomic URL and semantic cover.

## Release And Remaining Gates

LAN activation passed on 2026-11-02 from clean committed
`fae42774ce8e245c55f381a2e2f77082594cf2cc` into slot `.next-local-b` on
`0.0.0.0:3001`. `/api/version` reports that commit in candidate/versioned mode;
`/review` returns 200 on loopback and LAN; the launcher receipt
`.fluxpost-local-candidate.json` records the same SHA. Re-activation after the
bookkeeping commit is the final identity step.

Real authenticated operator review, actual model outputs and real Feishu
publication remain separate acceptance gates. Browser low-height cases emulate
zoom's reduced CSS viewport; manual physical-device/browser zoom remains useful.
