# Handoff

Last updated: 2026-07-01

This file is an on-demand history library. Do not read it during default startup; read the latest marker block only when recent cross-session history is needed.

## 最近一条
<!-- TRELLIS-LATEST-START -->
2026-07-29 local Canvas batch concurrency repair is ready but not loaded.

Completed:
- Root cause: `ensureCanvasRunWorker()` had one global consumer, so Canvas image child runs were claimed serially despite the shared image pool allowing concurrent provider work.
- Added `WORKER_CANVAS_RUN_CONCURRENCY` (default 8, cap 20) in `src/lib/concurrency.ts`; `src/lib/canvas/runs.ts` now starts enough short-lived consumers to fill missing worker slots. Provider image and one-slot Klein limits are unchanged.
- Focused concurrency/Canvas checks, TypeScript, changed-file lint, and `npm run build` passed without live providers.

Blocked before local refresh:
- Read-only `npm run db:diagnose` found `simple-1785314521332` still running at 2026-07-29T08:45Z. Do not run `npm run local:restart` until it is terminal because restart can interrupt a simple run.
- The required wrapper cannot start because `.trellis/verification/check.ps1` references missing `.trellis/verification/check.mjs`; repository-wide lint also scans existing `.tmp-*` artifacts. Do not repair either unrelated issue as part of this task.

Next:
- Recheck `npm run db:diagnose`; when no simple run is running, run `npm run local:restart` and confirm the Canvas worker concurrency repair is live.
<!-- TRELLIS-LATEST-END -->

## 历史记录

- Full pre-migration handoff preserved at `.trellis/spec/fluxpost/archive/handoff-history-2026-06-17.md`.
- Use heading, date, keyword, or feature id search before opening long archive sections.
