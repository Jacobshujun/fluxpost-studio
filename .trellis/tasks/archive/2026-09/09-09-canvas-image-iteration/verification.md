# Verification and handoff

Date: 2026-09-09. Implementation complete; feature ready for review, not live-provider accepted. No commit, candidate activation, push or deployment performed. Port 3001 remains unchanged.

## Automated evidence

- Full baseline: `$env:TRELLIS_SMOKE_PORT='45678'; powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` passed after final runtime/queue fixes. Includes lint (17 existing warnings, zero errors), TypeScript, Next production build, isolated worker-disabled HTTP smoke and SQLite store checks. Existing build tracing warnings remain.
- Five added deterministic suites cover graph contracts, per-item runtime, Canvas integration, owner-checked actions/schedule refresh and SQLite queue transactions. All are included in the full baseline.
- Contract cases: no nesting, permitted node types, total graph budget, selected outputs, recursive decode/clipboard/import, config secret stripping, billable confirmation, shared dependency rejection, freezing and aggregate preservation of text plus image ports.
- Runtime cases: five images, duplicate source URLs, original order despite out-of-order completion, shared inputs, 1/18 item boundaries, empty/19 rejection, concurrency admission, failed-generation-only retry preserving vision results, all versus at-least-one, entire failure, frozen inputs, separate parent identities, cancelled-before-admission, idempotent revisions and stale downstream on repair.
- Canvas/action cases: parent yield/resume, entry injection, owner isolation, no downstream calls during repair, cancelled metadata retention, explicit refresh excluding publish, published/shared locks, cancelled/paused schedule rejection and delivery replay after partial persistence.
- Queue cases execute extracted database functions on in-memory SQLite: wake-before/after-park, duplicate notifications, worker leases, cancelled state, restart/expired-lock recovery, held retry admission, cancellation reset, history limit filtering, atomic finish/wake rollback and crash after child terminal save without resubmission. PostgreSQL query shape checked, no live PostgreSQL acceptance.
- Browser: `$env:BROWSER_BASE_URL='http://127.0.0.1:45678'; python .trellis/verification/canvas_iteration_browser_check.py` passed on final build at 1440px (28 intercepted requests) and 390px (26). No page errors, horizontal overflow, live-provider calls or real API writes.
- Browser cases include nested editor controls, save/reload, output selectors, original indices, retry/refresh confirmation, shared-output checkbox grouping/locks, desktop copy/export/import, deletion cleanup of outer edges, image 4K ratio normalization and initial mobile viewport sizing.
- Ignored local screenshots: `test-artifacts/canvas-iteration-overview-1440.png`, `test-artifacts/canvas-iteration-overview-390.png`, `test-artifacts/canvas-iteration-editor-1440.png`, `test-artifacts/canvas-iteration-editor-390.png` and result/schedule screenshots.

## Operator usage after approved activation

Add utility node "逐图迭代". Connect collection images to its image input; shared text/references are optional. Expand region to edit ordinary vision/text/image nodes, then select inner text/image outputs. Return to outer Canvas and connect aggregate outputs to composition. Default policy requires all items to succeed. Optional at-least-one exposes failed-item repair, and repaired delivered results require explicit downstream refresh.

Shared regions freeze all configured ports together. For schedule variants, sharing must be explicit and independent of child parameters. Completed shared stages require a new schedule to change. V2 manual refresh creates a new aggregate draft, retaining the old draft; it rejects published outputs and paused/cancelled schedules. No refresh auto-publishes.

## Remaining operator gates

Authenticated live-provider workflows and multi-process PostgreSQL concurrency have not been exercised. On 2026-09-10 the user authorized the scoped local commit only. Local 3001 cannot show this change until clean candidate activation is separately authorized. No push, deployment or data/config synchronization is authorized.
