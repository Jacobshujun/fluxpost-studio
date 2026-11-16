# General content-pool batch read repair — November 16

## Implemented scope

- Candidate reads expand project JSON once with an explicit selection-field projection, omitting unused raw/analysis/visual metadata. Dropdown counts use the same content-presence rule without normalizing every unrelated item. Collection/project scoping happens before media/timestamp normalization; the existing selection filter/sort/cursor code remains authoritative.
- Source reads, explicit snapshot refresh and manual freezing use one full-item JSONPath array query on PostgreSQL (`json_each` with bound array on SQLite), rather than N containment probes followed by full-project reads. The server-only result retains raw and normalizes only the selected items. Explicit project identity, ID order, ownership/missing errors and frozen values remain intact.
- Full condition matching resolves collection/descendant IDs before the full-item read. It still normalizes raw before matching. Unrestricted matching must still consider all accessible items; the separate normalized item-table migration remains out of scope.
- No task ID, account, collection or batch size is hard-coded. The 200-item select-all cap and random sampling/revision rules are unchanged. No provider/Feishu calls, user-data migration or schedule replay was performed.

## Read-only runtime comparison

The comparison uses the current primary worktree versus pre-repair HEAD in two ignored diagnostic bundles. Both skip schema initialization and enforce read-only PostgreSQL transactions at connection level. This measures backend domain work, not authenticated end-to-end browser latency. Snapshot time is fixed for exact comparisons. Different concurrent query timings must not be summed as elapsed time.

| Operation | Before | After | Database queries before → after |
| --- | ---: | ---: | ---: |
| Reported collection, 40-item page | 1,530 ms | 786 ms | 3 → 3 |
| 50 selected-item snapshots | 3,061 ms | 627 ms | 51 → 1 |
| 95 selected-item snapshots | 4,750 ms | 617 ms | 96 → 1 |
| 200 selected-item snapshots | 8,740 ms | 760 ms | 201 → 1 |
| Full collection match resolution, 95 items | 3,642 ms | 671 ms | no per-ID probes |

Additional candidate samples: collection search 1,428 → 732 ms, local-complete filter 1,466 → 726 ms, published sort 1,451 → 719 ms. Unfiltered administrator page: 1,462 → 1,074 ms, still processing all accessible candidates. These are individual comparative samples, not P95 promises or evidence for 50 simultaneous independent previews.

Candidate responses deep-equal the previous implementation for collection, unrestricted, empty project, search, local-media and published-sort cases. Snapshot outputs deep-equal the old implementation for 50/95/200 IDs, including source/media URLs and project choice. Full collection match outputs also deep-equal. One initial implementation sorted full-item projects like browsing, which changed duplicate-ID precedence; the comparison caught it. Full-item reads now retain their previous traversal behavior while browsing retains its established sort.

## Verification

- Focused content-pool desk, selection, performance and editor checks plus TypeScript passed.
- New `content_pool_batch_reads_check.mjs` passes on SQLite and loopback PostgreSQL. The PostgreSQL variant creates only a temporary table in an explicit transaction with `search_path=pg_temp`, then rolls back. Command: `node --env-file=.env.local .trellis/verification/content_pool_batch_reads_check.mjs --postgres`.
- New SQL tests cover compact field projection, 50/95/200 complete-item reads, missing/empty/injection-like IDs, account and project restrictions, duplicate IDs and unowned legacy data. Domain fixtures additionally cover frozen order/independence, descendant filters, unchanged dropdown counts and the 200-item cap. Default baseline includes the SQLite variant only.
- Full deterministic baseline passed with exit code 0: contracts/runtime fixtures, lint (0 errors / 15 warnings), TypeScript, production build and isolated HTTP smoke. Build emits filesystem-tracing warnings. Context budgets pass at 44.96/45 KB and 69.98/70 KB; no check was weakened.
- `powershell -ExecutionPolicy Bypass -File .trellis/verification/content_pool_browser_checks.ps1` passed with exit code 0: responsiveness/query/cancellation/cache/snapshot flows plus editor regressions, each in three themes at 1440 and 390 (12 cases total). All APIs/media are intercepted on worker-disabled port 45678. These are behavioral UI checks, not live browser latency measurements.
- `trellis-check` review covered selection field completeness, project/item visibility, duplicate traversal, raw-derived normalization, unchanged snapshot schema, shared selector/cursor usage, parameterized SQL and isolated test cleanup. `git diff --check` passed. No frontend controls, schema, planner settings or provider dispatch changed.

## Activation boundary

The existing port-3001 candidate stays active until the verified commit is clean. Initial aggregate status counts included 17 running schedules, 106 running runs and 87 running queue rows, but subsequent read-only inspection established those schedule/run states were last updated November 12 or earlier, with no valid queue leases. The reported November 16 task is completed. These historical states were not changed. Recheck fresh leases and recent active work immediately before switching; the managed restart uses forced listener replacement. No dirty-tree restart, alternate application environment, worktree or production deployment is allowed.

Local activation uses the existing `npm run local:lan` entry after verification/commit. Its ignored `.fluxpost-local-candidate.json` receipt and live `/api/version` identify the resulting full SHA and bind; inspect those after the switch. This task does not push code or deploy remote production.

## Prevention

The earlier optimization addressed repeated browser requests but left per-request full-pool work and assumed containment queries would keep using GIN. Regression prevention now separates query-count, transferred/normalized item count, semantic parity and measured elapsed time. A valid index is insufficient evidence of an actual execution plan. The remaining project-JSON storage cost and unrestricted match cost require separately scoped storage work if tighter latency targets are needed.
