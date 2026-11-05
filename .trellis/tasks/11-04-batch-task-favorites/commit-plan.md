# Proposed work commit

`feat(batch): add personal schedule favorites and reusable history`

One coherent feature commit covering persistence/API, both UI entries, checks and specs/task evidence. No remote push. LAN activation authorized by user on 2026-11-05.

## Files

- `.trellis/spec/fluxpost/batch_task_favorites.md`
- `.trellis/spec/fluxpost/feature_list.json`
- `.trellis/spec/fluxpost/index.md`
- `.trellis/spec/fluxpost/status.md`
- `.trellis/spec/fluxpost/verification.md`
- `.trellis/tasks/11-04-batch-task-favorites/check.jsonl`
- `.trellis/tasks/11-04-batch-task-favorites/commit-plan.md`
- `.trellis/tasks/11-04-batch-task-favorites/design.md`
- `.trellis/tasks/11-04-batch-task-favorites/implement.jsonl`
- `.trellis/tasks/11-04-batch-task-favorites/implement.md`
- `.trellis/tasks/11-04-batch-task-favorites/prd.md`
- `.trellis/tasks/11-04-batch-task-favorites/task.json`
- `.trellis/tasks/11-04-batch-task-favorites/verification.md`
- `.trellis/verification/batch_create_browser_check.py`
- `.trellis/verification/batch_favorites_browser_check.py`
- `.trellis/verification/canvas_schedule_favorites_check.mjs`
- `.trellis/verification/canvas_scheduler_check.mjs`
- `.trellis/verification/check.mjs`
- `db/migrations/008_canvas_schedule_favorites.sql`
- `src/app/api/canvas/schedules/[id]/favorite/route.ts`
- `src/app/api/canvas/schedules/route.ts`
- `src/app/batch-create/ScheduleList.tsx`
- `src/app/batch-create/batch-create.css`
- `src/app/batch-create/page.tsx`
- `src/app/canvas/page.tsx`
- `src/components/canvas-schedule/FavoriteControl.tsx`
- `src/components/canvas-schedule/favorites.css`
- `src/lib/canvas/schedule-favorite-schema.ts`
- `src/lib/canvas/schedule-favorites.ts`
- `src/lib/canvas/schedule-list-query.ts`
- `src/lib/canvas/types.ts`
- `src/lib/database.ts`

## Excluded preexisting changes

- `.trellis/tasks/archive/2026-11/11-04-local-afternoon-exit/` in full.
- The preexisting afternoon-interruption status entry in `.trellis/spec/fluxpost/status.md`; stage only current-task hunks.

## Approval

User confirmed commit and LAN activation on 2026-11-05. Commit this feature batch, archive through Trellis, then activate clean HEAD through npm run local:lan. Prior diagnostics are recorded in a separate documentation commit 707442c for the clean-tree gate.
