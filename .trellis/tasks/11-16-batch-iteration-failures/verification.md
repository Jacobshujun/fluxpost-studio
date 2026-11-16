# Batch iteration failure diagnostics and repair verification

## Behavior

V2 child/shared task records receive compact summaries of latest iteration attempts during terminal reconciliation. Each region lists one-based input indexes and failure counts; no media output arrays are copied into those summaries. Existing strict iteration and schedule aggregation policies remain unchanged.

The batch-create records and Canvas runtime tree show task group/result attribution and a lazy detail view. An authenticated GET of `/api/canvas/schedules/{id}/iterations?mainTaskId=...&childTaskId=...&phase=child` (or `phase=shared`) returns only that scope's regions/images, latest child status, source thumbnails, upstream errors and failed inner-node labels. It verifies schedule/run ownership and V2 batch context plus image parent/region/item identity. No providers are called and no browser polling was added.

An explicit `iterationNodeId` on the existing child/shared retry actions targets one region. Child requests persist `retryIterationNodeId` with `retryPending`; scheduler admission revalidates and clears the target, then calls the existing node/iteration retry engine. Successful image runs are reused. Non-iteration retry and bulk retry retain existing behavior. Frozen shared results and published/downstream refresh protections remain in the existing recovery lifecycle. Accepted partial output is not silently refreshed or published.

## Checks

- Focused diagnostics, scheduler, iteration runtime/actions/contracts and batch-create checks pass; TypeScript passes.
- New diagnostic fixtures cover latest attempts, strict/partial policy summaries, compact 50-group payloads, failed image/node detail mapping, exact scope reads and owner/run/region/item mismatch rejection.
- Scheduler fixtures cover selecting the second of two failed regions, persisted target across deferred admission, rejected nonexistent region and unchanged ordinary retry. Existing iteration-runtime fixtures verify successful analysis/image reuse, failure-only queue admission, strict 4/5 failure, accepted partial output, ordering and idempotent revisions.
- Full baseline passed with exit code 0: isolated contracts/runtime fixtures, lint (0 errors / 15 existing warnings), TypeScript, production build and HTTP smoke. Final UI-label corrections were rebuilt successfully and verified in the browser. Build retains file-tracing warnings.
- Browser desktop/mobile three-theme 50-group diagnostics/retry and guided creation regressions passed with runner exit code 0 (12 cases plus lossless eleven-input roundtrip). The diagnostic cases exercise both the result card and advanced runtime tree, shared-stage attribution, no eager details, exact group/child/region retry payload, one request per explicit expansion and unchanged successful groups. Mobile detail screenshots were inspected. Reproduce with `powershell -ExecutionPolicy Bypass -File .trellis/verification/batch_iteration_browser_checks.ps1`; worker-disabled port 45678, all APIs/media intercepted.
- Trellis-check review confirmed API/types/UI consistency, no new circular imports, parameterized scope IDs, exact parent/image identity, bounded lazy requests, failed-region revalidation and existing cancellation/shared/published guards. `git diff --check` passes. Stable contract: `.trellis/spec/fluxpost/batch_iteration.md`.

## Boundaries

No real generation, provider replay, historical task mutation or remote deployment. V1-specific and aggregate-run diagnostics are outside this V2 child/shared repair. Running-scope detail status is available on demand; compact summaries reconcile at terminal completion. Image index refers to the iteration input order (after any upstream selection).

Code must be committed after checks before managed port-3001 activation. Inspect fresh work immediately before any switch. Authenticated operator acceptance with actual failed batches remains distinct from isolated browser and offline recovery tests.

Read-only runtime check on November 16 found zero live Canvas leases, recent active schedules/runs/nodes, simple work or Feishu work. Recheck immediately before managed activation. Local identity and bind are verified after activation against clean HEAD; retain the ignored candidate receipt instead of copying runtime configuration into Trellis.

The root problem was a missing cross-layer projection: iteration metadata existed and recovery already reused successes, but batch consumers exposed only generic failure text. The repair surfaces that metadata with group/result attribution and routes explicit region selection through the existing scheduler. Tests now distinguish region selection, failure-only execution and UI error visibility; unchanged success policies prevent silently incomplete posts.
