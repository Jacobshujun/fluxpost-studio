# Canvas Batch Content Scheduler V1 Design

## Architecture

Add a durable scheduler orchestration layer above existing Canvas runs. Scheduler records own hierarchy, sampling, dispatch, pause/cancel state, and aggregation; actual model nodes continue to execute through `src/lib/canvas/runs.ts` and the shared provider pools.

Each image child creates a normal immutable Canvas run targeted at the bound GPT-Image node. Its server-created snapshot binds one scene asset, one vehicle asset, and the batch strategy. After all children are terminal, a finalization run seeds the image node output with the successful child artifacts and provenance, prunes already-satisfied ancestors, and executes the downstream text/composition target once.

## Contracts And Persistence

- Extend `CanvasNode` with an optional scheduler role and add `utility.prompt-switch` with three stable ordinal text inputs and one text output. V2 stores `selectedInput: 1 | 2 | 3`; editable V1 nodes and their incoming edge ports upgrade explicitly while immutable V1 run snapshots retain legacy execution semantics.
- Add schedule, batch, content-task, and image-task contracts with draft/runtime state, workflow revision, filters, frozen assets, counts, timestamps, and Canvas run references.
- Add equivalent PostgreSQL and SQLite tables/indexes through the existing database boundary. Draft saves use optimistic revision checks; launch uses one database transaction.
- Extend Canvas run provenance for server-seeded aggregate outputs. The browser cannot submit arbitrary seeded artifacts or graph snapshots.
- Add authenticated `/api/canvas/schedules` routes for list/create and owner-scoped detail actions for save, preflight/resample, launch, duplicate, pause/resume/cancel, and retry.

## Scheduling And State

- Preflight resolves all visible assets server-side, applies current library filter semantics, samples an inclusive integer count and distinct vehicle assets per content task, enforces the 2,000-child ceiling, and stores a preview revision.
- Launch revalidates the workflow revision, permissions, assets, bindings, prompt branch, and preview revision before atomically inserting runtime tasks.
- A durable dispatcher admits pending image tasks in round-robin batch order for each owner. Existing Canvas run workers and provider pools retain submission/query ownership.
- Pause prevents new dispatch and finalization; already accepted work remains resumable. Cancel marks unstarted work terminal and requests cancellation for associated Canvas runs without creating replacement submissions.
- Batch/schedule status is derived from child states. Runtime configuration and frozen samples are immutable.

## UI

Add a wide Canvas drawer with `批量调度` and `任务中心` views. The draft editor supports multiple unframed batch sections, existing library pickers/filters, Switch strategy selection, min/max vehicle counts, expected-call totals, preflight errors, thumbnail sampling preview, and targeted resampling. Mobile uses the existing full-width panel pattern.

The task center adds schedule > batch > content > image hierarchy, progress counts, partial/error details, pause/resume/cancel, failed-child retry, and links to generated review drafts. Existing single-run history remains available.

The Canvas toolbar exposes an insertion command for the standard scheduler skeleton. It creates two library-image inputs, three ordinary text prompt inputs, one prompt Switch, one GPT-Image-2 V2 target, one body text input, and one content assembly target with unique scheduler roles and valid connections. The command refuses to insert when any scheduler role already exists and never replaces unrelated graph content.

## Safety And Compatibility

- Existing workflows and Canvas runs without scheduler metadata retain current behavior.
- Unknown or duplicate scheduler roles fail preflight; no label-based fallback is allowed.
- External calls occur only after the launch transaction commits and the worker claims durable work.
- Provider task ids remain authoritative. Accepted tasks are queried, never automatically re-submitted.
- Generated-post image synchronization uses a stored assembly fingerprint/revision guard and never overwrites edited or reviewed content.
