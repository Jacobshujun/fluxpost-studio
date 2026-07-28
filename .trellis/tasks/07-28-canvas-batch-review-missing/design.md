# Design

## Data Flow

`canvas_run_queue` -> Canvas run worker -> terminal `canvas_runs` -> Canvas schedule reconciler -> deterministic finalization run -> `compose.social-post` -> `generated_posts` -> `/api/production/posts` -> review desk.

The missing boundary is process recovery: durable rows survive restart, but the scheduler worker is currently started only by schedule API traffic.

## Proposed Change

1. Add a Next.js Node instrumentation entry point that starts the existing Canvas run worker and schedule reconciler when a server process starts.
2. Add a narrow terminal-run notification so a completed batch child wakes the schedule reconciler immediately. Keep the dependency direction explicit and avoid moving scheduler logic into routes or UI.
3. Reconcile and finalize each content task independently as soon as all of that content task's image children are terminal and at least one image succeeded. Do not gate finalization on batch-level or schedule-level completion.
4. Preserve the current deterministic final run id (`canvas-scheduler-final-<contentTaskId>`) and `createCanvasRunFromGraph` idempotency guard.
5. Keep `executeComposition` and `saveGeneratedPost(post, account)` as the only generated-post write path; no review API changes are needed.

## Compatibility And Safety

- Startup recovery operates only on persisted active schedules and queued/recoverable run rows.
- Existing provider task ids remain the source of truth for accepted paid work; recovery queries the same id and does not submit a replacement.
- Finalization remains owner-scoped from the frozen schedule/workflow snapshot.
- Completed, failed, cancelled, and manually paused schedules keep their existing state rules.
- The default verification path uses static or mocked persistence and must not touch live providers or Feishu.

## Rollback

Remove the instrumentation wakeup and terminal notification while leaving the persisted schemas and task rows untouched. Existing schedule API access would continue to provide the pre-fix manual wakeup behavior.
