# Technical Design

## Run Readiness

Add an ordinary-run readiness pass after graph planning and before run creation. It examines only included enabled `input.competitor-workbook` nodes. Scheduler graph snapshots with frozen row/card literals pass directly; normal nodes require a frozen snapshot containing the selected row and card. A failure appends a blocker with code `competitor_workbook_snapshot_required` and sets `preflightBlocked=true`. Unrelated targeted branches and disabled workbook nodes remain unaffected.

The browser maps the blocker code to a structured run notice. It selects and focuses the workbook node, explains `检查并冻结测试行`, and exposes an `打开批量调度` action. Provider capability confirmation remains unchanged.

## Save And Run Interaction

Use a dedicated run-request state rather than treating background workflow saving as a disabled-run condition. A click sets progress feedback immediately, calls the existing save coordinator when the graph is dirty or saving, waits for the resolved revision, then plans and starts exactly one run. Run-request state disables duplicate clicks; other Canvas busy operations still block runs. Keyboard commands call the same function.

## Durable Node Projection

Add a workflow-filtered database query for runs so the per-workflow limit is applied in SQL before deserialization. Add a second workflow query for node attempts across all statuses, ordered by run creation and node attempt. The service deduplicates by node id into `CanvasLatestNodeAttempt`, while retaining the current successful-only projection for artifact fallback and isolated reuse.

`GET /api/canvas/runs?workflowId=...` returns both projections. Workbook node configs are path-redacted in each projection. No persistence schema changes are required.

The Canvas page stores both maps. Normal workflow display uses the latest attempt for status and the latest successful projection for fallback artifacts. Explicit task-center history selection uses only the selected run's node attempts. A failed latest attempt therefore remains visible without hiding an older valid image/text result. Running attempts surface `waitReason`, including the existing image-network recovery state.

## Compatibility Boundaries

- Batch schedules continue creating runs from already-frozen graphs and keep current admission, retry, and aggregation behavior.
- Network errors continue becoming durable running/waiting node attempts and requeue on the existing cadence.
- Generated posts, review controls, partial-state isolation, and Feishu validation are untouched.
- Existing clients can ignore the additive `latestNodeAttempts` response field and optional blocker `code`.

## Rollback

Rollback is code-only. There is no migration or runtime-data rewrite. Reverting the commit restores the previous UI/history projection without changing queued work or saved artifacts.
