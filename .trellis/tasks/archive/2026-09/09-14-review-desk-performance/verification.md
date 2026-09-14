# Review performance verification

Completed 2026-09-14. Baseline commit for measurements: `c0886bee6f19d02884522009cb4e6e6855fa0298`.

## Results

| Isolated fixture | Before P95 | After P95 |
| --- | ---: | ---: |
| SQLite, 1,000 posts, read/save/source sync | 7.35 ms | 0.70 ms |
| SQLite, 10,000 posts, read/save/source sync | 84.73 ms | 7.23 ms |
| PostgreSQL, 1,000 posts, manual save | 57.20 ms | 2.42 ms |
| PostgreSQL, 1,000 posts, approve edited body | 52.99 ms | 2.23 ms |
| PostgreSQL, 10,000 posts, manual save | 615.45 ms | 1.91 ms |
| PostgreSQL, 10,000 posts, approve edited body | 632.76 ms | 2.35 ms |

- PostgreSQL 10,000-post list: 10,066,718 bytes before; 16,386 bytes per 50-row page after.
- PostgreSQL post-change stage P95: read 0.3 ms, save 0.6 ms, awaited source sync 1.4 ms.
- Final mocked Chrome 1440x960/1,000-post fixture: input P95 14.3 ms, click P95 13.6 ms.
- Final mocked Chrome 390x960/10,000-post fixture: input P95 13.6 ms, click P95 13.7 ms.
- Measurements are local fixture evidence, not production latency claims. PostgreSQL benchmark uses actual before/after route/domain/database code in a disposable schema; account authentication and activity logging are stubs, and it does not include HTTP network cost or provider work.

## Checks

- `node .trellis/verification/review_performance_check.mjs`: real isolated SQLite pagination, all filters, timestamps, author/owner isolation, stable cursors, compact payloads, changed video/vehicle fields, point reads, targeted writes, monotone status, single usage increment and source concurrency. Local/remote mocked image bytes, contain sizes, cache hits, concurrent deduplication, corrupt images, rejected traversal and explicit remote errors pass.
- `node --env-file=.env.local .trellis/verification/review_postgres_benchmark.mjs`: local PostgreSQL only, unique schema dropped in finally. Before/after measurements plus pagination, metadata, ownership and twelve concurrent source updates pass. No production tables/configuration changes.
- `npx --no-install tsx .trellis/verification/review_performance_benchmark.ts`: SQLite fixtures in OS temporary directories; no user data.
- `python .trellis/verification/review_performance_browser_check.py`: use `BROWSER_BASE_URL=http://127.0.0.1:45678` with a worker-disabled isolated Next smoke server. Rejects port 3001. All APIs and media requests intercepted; no external actions.
- Browser coverage: 50 visible rows, no full-list API, no data fetch or gallery mutation during typing, delayed saves retain newer input, failure retains edits, approval stays selected, old detail cannot replace new selection, saving then switching stays on the new post, cross-page publishing includes all checked IDs, filter reset, stale search, deep-link reload, replacement previews, same-item click, 200-ID limit, explicit failed thumbnail and no overflow.
- Final `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`: full baseline passed, lint 0 errors/17 existing warnings, TypeScript/build/config checks, review API HTTP 401, HTTP/SQLite smoke. Existing Turbopack warnings remain.
- Screenshots inspected: `test-artifacts/review-performance/review-1440.png` and `review-390.png`; synthetic media only.

## Delivery Boundaries

- Implementation verification did not restart or activate port 3001, push to GitHub, deploy, call paid models or write to Feishu. The user subsequently authorized a local commit.
- Generated-post indexes are additive for PostgreSQL and SQLite. Source updates use PostgreSQL row locks and SQLite immediate transactions on matching projects; SQLite source discovery still scans project JSON inside SQL, without transferring or writing unrelated projects.
- Approval remains on the current post even when its status leaves the filter. Current page and metadata refresh independently after persistence. Full-post cache is bounded to ten and retains the selected post; selection retains at most 200 compact rows.
- Review POST accepts `postId` and changed fields, retains `post.id` compatibility and the existing awaited-body/background-status side-effect contract. New list/detail/metadata/thumbnail routes enforce account access.
- Existing content-pool whole-project writers outside review retain their prior semantics; this task does not redesign all content-pool writes. Live operator/network acceptance remains pending candidate activation.
