# Ownership and sequence

Main: types, durable runs/queue/database, API, scheduler retry, runtime tests, integration and baseline.

Contract worker: iteration.ts pure helpers, registry.ts, serialization.ts, graph.ts, clipboard.ts, workflow-file.ts, scheduler-v2.ts, content-collection-schedule.ts, focused contract tests. No types/runs/scheduler/UI edits.

UI worker: src/app/canvas/page.tsx, route-local iteration UI/CSS; nested editor, output selectors, result details/retry/refresh. No contract/runtime edits.

No commits or activation. Baseline main-only. One Trellis task.
