# Design

- Add a pure compact projection from latest region attempts to shared types: per-region name, totals, failed indexes/errors and configured success policy. Persist summaries alongside existing child/shared reconciliation, where terminal node runs are already read. Never embed full inputs, outputs or raw model responses in schedule records.
- Add an authenticated on-demand schedule iteration-details endpoint. Resolve scope by schedule/main/child/phase, authorize both schedule and run, validate iteration child identity, and return source thumbnails plus latest status and failed inner-node labels. Read one selected scope only; no polling or provider dispatch.
- Optional `iterationNodeId` on existing retry/retry-shared actions validates an actual failed region. Store the selected region as a deferred retry target for child tasks; resolve/revalidate at activation and clear afterward. Ordinary retries still choose the existing default target. Existing `retryCanvasNode`/`resetCanvasIterationFailures` own successful-item reuse, queue admission and downstream revision behavior.
- Shared UI renders summary counts immediately and requests details only on expansion/explicit refresh. Each region has a named retry command under an unambiguous group/result label. Completed/active/frozen scopes must not offer an unsafe repair action. Existing result retry stays available for non-iteration failures.
- Shared success-policy hints describe strict failure vs partial delivery; do not change policies by default or suppress missing images. Other groups continue according to existing scheduler logic.

## Risks

The scheduler imports runtime helpers and existing iteration actions import the scheduler; avoid new circular imports. Use the compact projection in a standalone pure module. Preserve bounded response size and existing revision comparison. Details and retry errors must be explicit. Stale requests must not overwrite another schedule/region or resubmit paid work.
