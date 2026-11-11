# Findings

Date: 2026-11-11 (Asia/Shanghai)

## Confirmed evidence

- Port 3001 reports candidate commit `0a0df0711b702546bc62e5c310038e51b8cc179e`, matching the inspected source.
- Schedule `canvas-schedule-1794369020299-1cdddaf7` completed with two main tasks and four completed children, two children per main task.
- The selected child result is the GPT image node. The sole child parameter binds the additional-image library node, which has no path to that GPT node.
- All four child runs executed GPT with the expected main-task text and main-task style reference. Within each main task, both GPT input objects are identical. The child-selected additional images never enter these executions.
- Child random sampling therefore expands repeated GPT executions rather than contributing additional photos to the chosen child result.
- At aggregation, only main-scoped parameter values are injected. The additional-image library node executes from its frozen Canvas config, retaining the same original vehicle photo in both main tasks. The child-selected photos are not aggregated.
- The main-scoped vehicle-image parameter supplies one other vehicle photo per main task. Its random exact count of two expands assignments across the two main tasks; it does not create a two-image bundle for each post.
- Final composition receives two generated text-card images, the frozen additional vehicle photo, and the main-task vehicle photo, in that edge order.
- Both generated-post records remain version 1. Their image arrays exactly match the persisted composition projections. No cross-main image leakage or later saved reorder is present in these records.
- A contact sheet of all eight saved images visually confirms two near-identical text cards followed by two vehicle photos per post. Local ignored evidence: `test-artifacts/batch-115020-contact-sheet.png`.
- The frozen Canvas config and the schedule's library sources differ for the additional-image and vehicle-image inputs. The cause of that editing history is not established; the evidence does not attribute it to an operator mistake or an automatic UI swap.

## Code mechanism

- `src/lib/canvas/scheduler-v2.ts`, `validateCanvasScheduleV2Definition`: validates binding existence, field/type/source compatibility, shared stages, and child-to-main reachability, but does not reject child parameters outside the selected child result's dependency path.
- `src/lib/canvas/scheduler.ts`, `prepareCanvasScheduleV2PendingChildRuns`: applies main and child values, then targets only the selected child result. Unrelated parameter branches do not execute.
- `src/lib/canvas/scheduler.ts`, aggregate request loop: applies only main parameters, then aggregates successful child result artifacts.
- `src/lib/canvas/scheduler-v2.ts`, `createCanvasScheduleV2AggregateGraph`: replaces the selected child result with literal aggregated output and prunes its incoming edges. Other graph branches retain their frozen config.
- `src/lib/canvas/runs.ts`, `collectInputs`, and `src/lib/canvas/executors.ts`, `executeComposition` / `mediaUrls`: preserve incoming edge order when flattening images into the post.
- `duplicateCanvasSchedule` preserves the source schedule's parameter definition while referencing the current workflow revision. This permits schedule sources to differ from current Canvas selections; it does not itself establish the editing sequence of this incident.

## Correction direction

If the intended post is one generated text card plus several sampled additional
photos and a vehicle photo, the repeated result should be the processed
additional photo. Generate the text card once per main task through a shared
output, aggregate the additional-photo results, and keep vehicle selection at
main scope. Confirm the desired counts before changing an existing task.

Separately, preflight should explicitly reject or explain a child-scoped
parameter that cannot affect the selected child result, instead of allowing
successful but ineffective expansion. Runtime history must remain immutable.

## Verification

Read-only PostgreSQL queries used the dedicated diagnostic connection and
`BEGIN READ ONLY`; tracing queries used a bounded statement timeout. Image
inspection fetched existing OSS objects only. No model requests, Feishu writes,
runtime updates, or listener replacement were performed.

The documented deterministic baseline passed on 2026-11-11, including offline
contracts, lint, TypeScript, build, isolated HTTP smoke on port 45678, and SQLite
checks. Local ignored log:
`test-artifacts/batch-image-order-investigation-baseline.log`.
