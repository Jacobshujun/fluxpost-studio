# Implementation Plan

- [x] Add deterministic regression coverage for server-start worker wakeup, batch-terminal scheduler wakeup, and per-content finalization while sibling content tasks are still running, without provider calls.
- [x] Add the Node server startup hook using the existing `ensureCanvasRunWorker` and `kickCanvasSchedulerWorker` entry points.
- [x] Wire terminal batch child completion to the scheduler wakeup without introducing duplicate final runs or a static import cycle.
- [x] Run the focused Canvas scheduler/workflow checks and TypeScript.
- [x] Read the completion verification spec, then run lint, build, and the full Trellis baseline. The baseline passed every domain check through Canvas and stopped at the unrelated untracked `.tmp-canvas-common-nodes-browser-check.cjs` lint error; full lint passes when that file is excluded.
- [x] Before restarting the local production server, inspect active Canvas rows because startup recovery can legitimately continue operator-launched pending finalization work; do not treat that continuation as a baseline test.
- [x] Confirm the affected schedule reaches finalization and its generated post ids exist through read-only local database checks, without printing private content or credentials. Draft count advanced from 0 to 2 while siblings were active, then to 8 while the schedule continued.

## Risk Points

- `src/instrumentation.ts`: must run only in the Node runtime and must not start workers during deterministic build checks.
- `src/lib/canvas/runs.ts` and `src/lib/canvas/scheduler.ts`: avoid a static circular dependency and preserve accepted provider id resumption.
- Local restart: the current active schedule contains legitimate unfinished finalization work and may invoke the already-authorized text workflow when recovery starts.

## Validation Commands

```powershell
node .trellis/verification/canvas_scheduler_check.mjs
npx --no-install tsc --noEmit
npm run lint
npm run build
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```
