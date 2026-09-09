# Design: Canvas Content Collection

Status: approved revised link-batch design implemented on 2026-09-09. Generic downstream support includes vision analysis, not only image reconstruction.

## Evidence

- src/app/content/page.tsx calls /api/crawl/jobs and /api/crawl/links with platform settings and skipTagging; both endpoints already support skipping tagging.
- src/lib/source-link-import.ts returns imported items and per-link outcomes, including failures and duplicates.
- src/lib/canvas/registry.ts defines input.content-pool with title/body/source/images/videos outputs and frozen config; executors.ts projects it into literal outputs.
- src/app/canvas/page.tsx already separates source-video acquisition from downstream execution and supports content-pool snapshot selection.

## Proposed Flow

1. Register input.content-collection as 内容采集 in the input category.
2. Add link/ID controls using existing platform options, with tagging off by default. Keyword-result expansion remains outside this link-batch implementation and needs separate design.
3. Revised batch proposal: freeze input link parameters and expand one source-scoped main task per link before network acquisition. Use the existing scheduler rather than dynamically adding Canvas nodes.
4. Each task executes collection in the server worker using shared collection services, saves its source result, then passes only that source's text/media to its downstream graph. No server loopback HTTP or new crawler.
5. Per-image reconstruction iterates the current source's image group internally. Do not create a Cartesian product between source links and pooled images.
6. Retry downstream failures using successful acquisition output and existing per-image resume semantics. A failed source must not abort unrelated tasks. Missing config/demo output is not real collection success.
7. Single-node collection does not start downstream; a full run does. Multiple input links require explicit schedule expansion instead of silently selecting one result.

## Resolved Integration

- Reuse manual-list text parameters, bound to sourceLink at main-task scope. Presets trim/deduplicate exact lines; edited duplicate/empty/over-200-item lists fail validation.
- The existing scheduler shared phase is per main task, not global. Enable all five collection ports atomically, execute collection once per source, then replace it with an input.content-pool literal snapshot while preserving port identities.
- Child retries and final aggregation reuse this frozen result. Other shared-node aggregation behavior remains unchanged. Isolated downstream runs reuse collection results instead of treating this network-backed input as a local literal.
- Keep existing run-queue concurrency and node-level image concurrency; the UI warns about their combined effect rather than introducing a new limiter.
- Current executors.ts limits per-image reconstruction to 1-18 images. Surface unsupported sources as explicit per-task blockers; never silently trim. Automatic larger-group chunking needs separate approval/design.
- Keyword results need a separate collect-then-freeze expansion phase; that mechanism remains pending, not implicitly solved by link-list expansion.

## Invariants

- Preserve ingestion, ownership, safety, media processing and original tagging defaults.
- Missing automatic-tagging config remains off after import/reload.
- No Cookie control is introduced. Run outputs stay in existing durable run/schedule storage, never in browser-side acquisition state.
- Worker execution uses immutable graph snapshots; no acquisition response asynchronously patches an editable node or switched workflow.
- Failures are explicit and failed-source tasks never trigger their dependent children. New runs are explicit recollection; downstream retry is not recollection.
- No new database tables, icon dependencies or global style redesign.

## Expected Changes

- src/lib/canvas/registry.ts: definition, defaults and readiness.
- src/lib/canvas/executors.ts: collection execution and source-scoped outputs through shared services.
- src/lib/canvas/scheduler.ts, scheduler-v2.ts and types.ts: link expansion/binding, preflight and retry integration as required.
- src/app/canvas/page.tsx: panel integration and summary.
- src/lib/canvas/content-collection.ts, content-collection-service.ts and content-collection-schedule.ts isolate contracts, shared-service execution and generic preset construction.
- Existing crawl routes are unchanged.
- Existing .trellis/verification/ Canvas/source checks and mocked interaction coverage.

## Release

Verify in isolation first. No commit or port-3001 replacement without explicit authorization. Planning is not completion evidence.
