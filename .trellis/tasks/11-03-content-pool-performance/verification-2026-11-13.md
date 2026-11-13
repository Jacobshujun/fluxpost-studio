# November 13 responsiveness continuation

## Implemented

- Canvas and batch use a stable candidate query independent of selected IDs and selection mode. Concurrent equal requests share a fetch; cancelling one subscriber does not cancel others. Old query responses and aborted select-all operations cannot overwrite current state.
- Batch parameters load candidates only after opening their configuration. Select-all uses one IDs-only request with the existing 200-item cap.
- Candidate caches expire after 60 seconds and are capped at ten entries, 400 items per entry and 2 MiB estimated string storage in total. Session account/role is checked before reuse; account changes clear pages. Session storage holds normalized filters and scroll only, scoped by account and workflow/node or schedule/parameter.
- Existing node snapshots open without a candidate request. Changing a source and refreshing a snapshot use full item/project-targeted reads; project identity persists for duplicate-source correctness. No background operation changes frozen runs.
- Browser candidates and custom-tag suggestions use owner-scoped light rows instead of reading every project with raw. A fixed condition-matched schedule resolves its first candidate and loads only that source's full snapshot. Manual, random and each-mode snapshot semantics otherwise remain intact.
- Content saves cancel older list reads and use the PATCH result immediately. Loaded pages, editor and selection remain in place. An explicit list refresh handles changed ordering/filter membership before more pagination; statistics refresh independently only when affected.

## Verification

- Focused selection/cache, desk, performance-budget and editor checks passed during implementation. Runtime fixture checks include owner isolation, targeted item/project lookup, paging and tag suggestions. Cache checks include query equivalence, shared-request cancellation, expiry, entry bounds and account changes.
- Final full baseline passed with exit code 0, including lint (0 errors / 15 existing warnings), types, build and isolated HTTP smoke. Local ignored log: `.tmp-pool-release-baseline.log`.
- Responsiveness and editor browser checks passed in all three supported themes (professional/editorial/creator) at 1440/390: 12 cases, final runner exit code 0. The editor regression exposed a navigation-listener timing gap; installing the dirty guard in layout phase fixes that gap. Editor checks additionally assert no list/statistics request after text/image saves and retain all three loaded fixture cards after save-and-switch.
- Reproducible Windows browser runner: `powershell -ExecutionPolicy Bypass -File .trellis/verification/content_pool_browser_checks.ps1`. It requires free port 45678, starts a worker-disabled test process, runs both suites with intercepted API/media requests, and stops the exact process in `finally`. The generic shell-based helper left a stale server and was replaced for this test; port 3001 was never stopped.

## Observed behavior, not latency claims

The isolated browser fixture verifies one candidate GET after initial parameter opening plus two selection toggles and two mode changes; loading a second page makes two GETs in total, and reopening the 60-item list adds none. Node close/reopen restores the search and cached list; opening an existing snapshot adds no candidate request. Refreshing the browser preserves a successfully saved snapshot and restores its filter when changing the source.

No authenticated operator latency measurement has been performed on the runtime database. These request-count assertions are not a claim that P95 API latency is already below 300 ms.

## Remaining boundaries

- User authorized committing and updating LAN on November 13. Activation uses the primary worktree and `npm run local:lan`; the verified previous candidate is `1cf2192effca0d4217e0970aca7eb2653bbf51d7`. Final running SHA is reported by `/api/version` and the ignored local candidate receipt. No GitHub push or remote production deployment was requested.
- P2 item-table migration, project-JSON rewrite elimination and SQL-native pagination remain separate. Initial desk and summary still scan light rows separately. Random/each conditional preflight still resolves complete candidates to preserve existing sampling/freeze behavior; only fixed preflight was optimized here.
- Candidate response fields retain the existing shape. Full item payload reduction, cross-tab invalidation notifications and editor/list component isolation were not added; memory-cache TTL and explicit refresh bound candidate staleness. Input-render performance requires profiling before further component changes.
- No runtime data migration, media mutation, provider invocation, real crawl, Feishu write or production deployment was performed by verification.
