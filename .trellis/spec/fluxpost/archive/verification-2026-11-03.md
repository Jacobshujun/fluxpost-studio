# Verification evidence: early November 2026

Moved from verification.md on 2026-11-11 to satisfy its startup context budget.

- 2026-11-06 Library sorting: SQLite/PG, six browser flows, regressions and baseline pass. Evidence: `11-06-canvas-library-sorting`; contract/commands: `unified_library.md`.
- 2026-11-05 Review memory: offline/calendar, six theme/viewport memory flows and 45-layout/interaction regressions pass. Task: `11-05-review-filter-memory`.

- Content-pool manual editor: full baseline (0 errors/16 existing warnings), isolated SQLite/API/upload/cache contracts, six three-theme 1440/390 browser cases, library regression and 45 review layout cases pass. Task: `11-03-content-pool-editor`; contract: `content_pool_editing.md`.
- Feishu publish owner recovery: targeted checks and the full baseline pass (0 errors/16 warnings, TypeScript, smoke); owner mismatches repaired to 0; LAN `58f48b1` active. Task `11-03-feishu-publish-owner-recovery`.
- Content-pool performance: baseline (0 errors/16 warnings), types, build, isolated 45678 browser and desk/performance checks, and PostgreSQL read-only desk 960ms / summary 898ms (4,692 items, 66 KB, no `raw`) pass. Committed and active on 3001 with matching `/api/version` SHA and loopback/LAN `/content` 200. Manual authenticated timing remains.
