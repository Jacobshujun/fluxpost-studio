# Iteration Inner-Node Batch Parameters

## Goal

Allow batch schedules to configure supported parameters of nodes inside an image-iteration region, just as they configure outer nodes.

## Confirmed Background

- User requested this repair and approved task creation/planning on 2026-10-30.
- UI binding options currently enumerate only outer graph nodes (`src/app/canvas/page.tsx:6706`).
- V2 validation and injection resolve only outer node IDs (`src/lib/canvas/scheduler-v2.ts:60`, `src/lib/canvas/scheduler-v2.ts:293`).
- Schedule normalization retains only nodeId/fieldKey (`src/lib/canvas/scheduler.ts:2455`).
- Iteration supports one inner graph level; inner IDs are not global identities. Shared outputs must not depend on child-scoped parameters.

## Requirements

- R1: Offer existing batch-injectable fields of allowed inner nodes in both main-task and child-task parameter selectors; identify the containing region and inner node clearly.
- R2: Preserve the complete binding across save, reload and preflight. Apply each frozen assignment to the correct inner node in the run snapshot, never the editable source graph or another region.
- R3: Preserve existing outer bindings, parameter types, expansion rules and field restrictions. Reject missing regions/nodes, incompatible fields and duplicate bindings explicitly.
- R4: Treat a child-scoped inner binding as a dependency of its enclosing region for shared-output checks, preventing stale shared results.

## Acceptance Criteria

- AC1 (R1): Inner text/model fields are selectable and remain selected after saving/reloading, with distinguishable region labels on desktop/mobile.
- AC2 (R2): Two regions containing identical inner node IDs receive only their own assignments; expansion creates distinct snapshots and leaves the original unchanged.
- AC3 (R3): Existing outer-node schedules pass regression checks; invalid and duplicate nested bindings fail with clear errors.
- AC4 (R4): Child-scoped inner parameters prevent sharing the region or a downstream dependent output; main-scoped bindings remain shareable when otherwise valid.
- AC5: Focused scheduler/iteration checks, baseline and relevant UI checks have recorded results, including any unchanged blockers.

## Out Of Scope

- New parameter kinds, arbitrary fields not exposed by the registry, nested iteration, per-image scheduling semantics, changes to iteration execution/repair policy.
- Live model calls, production deployment, changes to user data, or replacement of the port-3001 candidate without the required verified commit/release authorization.

## Planning Gate

User approved the completed plan and implementation on 2026-10-30.
