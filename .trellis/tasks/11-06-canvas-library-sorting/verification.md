# Verification — 2026-11-06

## Implemented
- Seven asset orders, default updated-newest in Canvas/schedulers; existing gallery/copy defaults unchanged. Time is library metadata time, filename is displayed asset name.
- Deterministic seeded MD5 SQL ordering for SQLite and PostgreSQL, keyset cursors bound to sort/seed/filter, authorized selected-ID sorting endpoint (10,000 IDs maximum).
- Per-node primitive filter/order fields survive save/reload, graph serialization and clipboard copying; no shared inspector state. Saved organizer labels load on restore.
- Explicit ordering/selection commits reorder frozen ID/name/URL tuples atomically, preserve manual moves on reopening, retain state on failures, and reject stale responses.
- V1/V2/shared scheduling retains order/seed across normalization, saves and conditional pool resolution. Manual IDs keep their frozen order.

## Evidence
- `node .trellis/verification/library_order_check.mjs`: isolated SQLite fixtures, seven sorts, 61 authorized assets across 7-row pages, ties/Chinese/numeric names, global subset order, random seed restore/change, incompatible cursors, inaccessible/deleted IDs, route 200/400/401, graph/clipboard persistence pass.
- `node --env-file=.env.local --import tsx -e "process.env.LIBRARY_ORDER_POSTGRES='1'; import('./.trellis/verification/library_order_runtime_check.ts')"`: identical assertions pass against loopback PostgreSQL connection-local TEMP tables; no runtime row changes.
- `node .trellis/verification/canvas_scheduler_check.mjs`: V2 draft/store/reload and pool query carry sort/seed; existing scheduler/frozen-run checks pass.
- `python .trellis/verification/library_order_browser_check.py`: six professional/editorial/creator × 1440/390 cases pass with all API/media intercepted on worker-disabled 45678. Covers two nodes, seven sorts, cross-page selected snapshots, manual moves, independent organizer/tag/search state, reload, random paging/reshuffle, failed order, stale order and page response rejection, V1/V2 parameter independence, all-page selection and save/reopen. No external requests or page errors; no document horizontal overflow.
- Existing `canvas_smart_folders_browser_check.py` (2 widths) and `library_colors_browser_check.py` (6 theme/viewport cases) pass. Updated async selection mocks/assertions and the color fixture's previously missing favorite endpoint.
- Full baseline passed with 0 lint errors / 16 existing warnings, types, production build, isolated HTTP smoke and SQLite store check; final rerun is recorded in ignored `test-artifacts/library-order-final-baseline.log`.
- Screenshots/logs under ignored `test-artifacts/library-order-*`; no real model, publishing, media storage or remote deployment calls.

## Compatibility And Findings
- Existing image iteration explicitly rejects library-image nodes; preserved/tested its allow-list instead of adding a new node capability.
- The original state leak was local picker state reused by an inspector keyed only by field. Persistent node config plus identity-keyed UI/request guards fixes the source.
- SQLite/PostgreSQL do not need a schema migration. Existing selected snapshots are not reordered simply by opening a legacy workflow.
- Local activation uses the primary worktree and existing `0.0.0.0:3001` binding after verified commits. The ignored candidate receipt and `/api/version` are authoritative for the final SHA; operator acceptance remains pending.
