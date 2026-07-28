# Canvas Batch Content Scheduler V1

## Goal

Add an owner-scoped batch scheduler inside the infinite-canvas workspace so operators can turn one saved workflow revision into multiple independent batches of image-and-text content without duplicating provider submission or losing per-image auditability.

## Confirmed Requirements

- One schedule uses one saved workflow revision and contains multiple independently configured batches.
- Every batch owns its own reference-image filters, vehicle-image filters, random settings, and one prompt strategy.
- A scene image creates one content task. Each selected vehicle image creates one GPT-Image-2 child task for that content task.
- Vehicle count is sampled independently per content task from an inclusive user-defined range. Sampling is without replacement within one content task and may repeat across content tasks.
- Both reference and vehicle pools reuse the current Eagle-style library behavior: role-specific keyword, collection, and multi-tag AND filtering; no fixed vehicle/color schema is added.
- A three-input prompt Switch selects input 1, 2, or 3 from three ordinary Canvas text nodes. Prompt bodies are edited only in those text nodes; neither the Switch nor the scheduler owns a second prompt configuration.
- Every batch stores only the selected Switch input number. The selected input is fixed for the whole batch and frozen with the workflow snapshot.
- The Canvas provides an idempotent standard-scheduler skeleton insertion action so operators do not have to infer scheduler roles or required connections manually.
- Scheduler roles identify the scene input, vehicle input, prompt Switch, image target, and final content target without relying on node labels.
- Preflight resolves and previews every sample, supports per-content and whole-batch resampling, and freezes selected assets after confirmation.
- Launch is atomic across the complete schedule. Any invalid binding, missing asset, insufficient sample pool, or task-limit violation prevents all queue creation and all provider calls.
- Draft schedules autosave and can be resumed, deleted, or duplicated. Launched schedules are immutable; changes require duplication into a new draft.
- V1 starts immediately and supports fair automatic dispatch, pause, resume, cancel, and explicit failed-child retry. It does not include future scheduling or Cron.
- All image children are allowed to finish. At least one successful image continues to one text/finalization run and creates a partial review draft; zero successful images fails the content task.
- A later successful image retry appends a candidate without another text-model call. Pending untouched drafts may sync automatically; edited or reviewed drafts require explicit acceptance.
- Successful and partial content tasks enter the existing review workflow. V1 never publishes automatically.
- Typical target scale is 5-10 batches and about 100 content tasks; a schedule may not exceed 2,000 image child tasks.

## Acceptance Criteria

- [x] A signed-in operator can create, autosave, reopen, duplicate, and delete an owner-scoped scheduler draft from `/canvas`.
- [x] The current workflow can persist unique scheduler-role bindings and a three-branch prompt Switch that remains usable in normal manual runs.
- [x] Three independently editable text nodes connect to Switch inputs 1/2/3, and both manual runs and scheduler snapshots use only the Switch-selected input.
- [x] The scheduler batch editor selects input 1/2/3 without exposing prompt-body editing or semantic prompt presets.
- [x] An operator can insert one complete scheduler skeleton without overwriting an existing graph or creating duplicate scheduler roles.
- [x] Reference and vehicle candidate pools use current library permissions, role, keyword, collection, and tag-AND semantics.
- [x] Preflight deterministically records one content task per scene plus a frozen, variable-size, duplicate-free vehicle sample for each content task.
- [x] Per-content and whole-batch resampling update the preview only before launch; retries reuse frozen samples.
- [x] A schedule launch either persists every batch/content/image task and queue record or persists none, and no external work starts before commit.
- [x] Image child runs reuse the existing Canvas provider execution and persisted provider task ids; pause, restart, and retry never resubmit an accepted paid task.
- [x] Active batches for one owner are dispatched fairly through existing provider concurrency limits without user-defined priority or concurrency controls.
- [x] Successful children aggregate into one finalization run per content task. Partial and failed behavior matches the confirmed rules and remains visible in the task center.
- [x] Generated content is owner-attributed, linked to its schedule hierarchy, and enters review without automatic Feishu publishing.
- [x] Desktop and mobile scheduler/task-center views remain usable without covering or resizing controls incoherently.
- [x] Deterministic checks cover bindings, filtering, sampling, atomic launch, state transitions, fairness, retry idempotency, aggregation, ownership, and responsive UI without live paid calls.
- [x] TypeScript, lint, build, Trellis baseline, local production restart, HTTP smoke, and browser screenshots pass or any unrelated pre-existing failure is reported precisely.

## Out Of Scope

- Future start times, recurring schedules, Cron, webhooks, conditional graph branches, or arbitrary loops.
- User-controlled provider concurrency, queue priority, automatic publication, or a new vehicle/color taxonomy.
- Re-randomizing a launched task, silently reducing an insufficient sample, or automatically overwriting edited/reviewed content.
