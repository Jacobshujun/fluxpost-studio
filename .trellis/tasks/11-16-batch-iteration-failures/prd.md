# Batch iteration failure visibility and scoped recovery

## Goal

Users running many source items in V2 batch scheduling must identify the task group, result item, iteration region and image index that failed, and explicitly repair failures while reusing successful images. The request follows a 50-item batch scalability discussion; do not require opening every workflow to find failed images.

## Requirements

- Show compact failed-image summaries under the owning child result/shared stage in both batch-create records and the Canvas schedule runtime tree.
- Load image-level source/status/error and failed inner-node labels on demand for one authenticated schedule task; no eager per-image HTTP fan-out across 50 tasks.
- Support explicit region-scoped retry through the schedule's existing recovery lifecycle. Successful image children stay untouched; no automatic provider calls, status masking or batch restarts.
- Keep configured iteration `all`/`at-least-one` and schedule aggregation rules unchanged. Explain where partial success can be selected without changing saved workflows.
- Preserve account and parent/child ownership, run identity, cancellation/pause, frozen shared outputs, published content and downstream refresh protections.
- Cover multiple regions, stale attempts, old records without summaries, 50 task groups, retry pending round trips and both desktop/mobile interfaces with isolated tests.

## Out of scope

Legacy V1-specific controls, automatic retries, per-image policy changes, model invocations, historical runtime mutation and remote deployment. Aggregate-stage failures keep their existing behavior; this repair targets V2 child and shared runs where image generation executes.
