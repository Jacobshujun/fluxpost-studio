# Design

CanvasNode.iteration is CanvasIterationDefinition with nested graph and optional text/images output selectors. Region type utility.image-iterate; inner root input.iteration-item provides images/index/text/references. Region inputs images/text/references and outputs text/images; reject connections to unconfigured outputs. Config failurePolicy all|at-least-one, concurrency default 4 (1-20). One level, 18 items, total graph budget includes children. Focused inner Canvas editor with return control. Existing text/image artifact shapes preserved.

Each item uses durable CanvasRun.iterationContext {parentRunId,regionNodeId,itemId,index}, separate from batchContext. Parent region node internalMetadata.iteration tracks items, runIds, status, output revision. Existing queue runs children; parent yields and durable completion wakes it without polling/holding worker. Internal runs excluded from normal history/reuse. Retry only unsuccessful items; delivered output repair marks downstream stale for explicit refresh. Shared results immutable after child consumption.

Owner checked GET /api/canvas/runs/:id/iterations/:nodeId returns {metadata, items:[{item,nodeRuns}]}. POST accepts action retry-failed|refresh-downstream. Cancellation cascades.

Region frozenOutputs holds text/images snapshots outside config preserving port IDs. Schedule validation/injection supports region multi-ports; existing collection behavior retained.

Recovery refinement: queue completion and parent wake are atomic. Startup restores waiting parents; subsequent drain only recovers expired leases. Terminal child queue recovery does not submit providers again. Cancellation metadata and provider IDs survive cancelled node attempts. Explicit retry clears cancellation through the database option.

Explicit V2 child refresh records per-region delivered revision on the schedule child, rejects paused/cancelled schedules, regenerates aggregate results into a new draft and preserves the previous draft. Normal workflow refresh updates unpublished composition only. Refresh never runs publishing nodes. Completed shared phases are frozen and retries require a new schedule.
