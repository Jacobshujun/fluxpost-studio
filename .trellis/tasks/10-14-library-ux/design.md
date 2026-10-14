# Design

Keep APIs/storage unchanged. Atomic query-parameter state in the shared URL helper prevents conflicting partial URL updates; pure library UI helpers convert filters and Beijing date boundaries. The page owns request generations, query selections, import receipts and organization commands. Viewer owns editable drafts, image transforms and explicit navigation guards. Native dialogs provide inert background, nested confirmation and focus restoration.

List reloads and cursor appends validate the live normalized query before committing. Detail loads are independently cancellable. Imports snapshot file/collection/visibility, use one serial runner and retain files for explicit retry; cancellation only affects queued work. Batch responses preserve failed IDs and show per-item errors. Membership and metadata writes retain separate permission contracts.

Original images load only in the viewer. Date-only ranges use Asia/Shanghai boundaries with exclusive next-day addedBefore. Multi-value filters map to singular API names. Tag removal reuses existing manual override projection.
