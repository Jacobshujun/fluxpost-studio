# Implementation Plan

## Review Gate

- [x] User authorized task creation/planning on 2026-09-09.
- [x] Inspect collection APIs and Canvas snapshots; write planning artifacts.
- [x] User approved revised source-scoped link batch implementation, including vision and other compatible downstream nodes. Keyword-mode expansion remains separate.
- [x] Activated with task.py start after approval.

## Execution

- [x] Read development guidelines; preserved pre-existing unrelated image-discard edits.
- [x] Add focused contracts for defaults, skipTagging mapping, readiness, serialization and outputs.
- [x] Implement node/controls using the existing link-import service, without loopback HTTP.
- [x] Integrate main-scoped links and five-port per-main shared snapshots, including final aggregation and isolated-run reuse.
- [x] Persist execution outputs separately from editable graphs; use task-local errors and existing retry/cancellation semantics.
- [x] Mock 20 links with variable image counts, actual vision/image executors and failed-image resume; verify no source/ successful-image replay.
- [x] Cover duplicate links, empty media, image limits, preservation of all original images and existing queue/node concurrency.
- [x] Existing Canvas workflows, schedulers, copy-library, source tagging and full baseline passed.
- [x] Browser checks cover tagging toggle/default, selected test link reset/save, generic vision preset, all five shared ports, 20-task preflight and desktop/mobile overflow without provider calls.

## Verification

Existing focused commands to inspect and extend:

```powershell
node .trellis/verification/canvas_workflows_check.mjs
node .trellis/verification/canvas_content_collection_check.mjs
node .trellis/verification/canvas_interaction_check.mjs
node .trellis/verification/canvas_content_pool_selection_check.mjs
node .trellis/verification/source_tagging_image_check.mjs
```

Complete offline baseline after implementation:

```powershell
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

Baseline includes TypeScript, lint, build and isolated HTTP/SQLite smoke. Mock providers and never modify real runtime data. Use the established worker-disabled isolated smoke path for uncommitted browser checks, not another application environment.

## Verification Evidence

- Full offline baseline passed, including 17 existing lint warnings/zero errors, TypeScript, build (three existing tracing warnings), HTTP smoke and isolated SQLite.
- Mocked Chromium passed at 1440px and 390px against the worker-disabled port-45678 smoke build. Screenshots are local test-artifacts only.
- Final post-layout-adjustment full baseline and both browser viewport checks passed on 2026-09-09. Isolated smoke listeners were stopped; port 3001 still listens on 0.0.0.0 without replacement.

## Completion

- [x] Updated status, verification commands and ready_for_review feature evidence; no live acceptance claimed.
- [x] Live-provider acceptance remains unverified; no paid/API collection or production writes performed.
- [x] No commit/activation authorized or performed; port 3001 and its LAN binding remain unchanged.
- [x] Scoped implementation and checks complete; archive with --no-commit. Candidate activation is a separate user-authorized release step.

## Subsequent Commit Authorization

- 2026-09-09: User requested a commit after implementation. Stage only this feature and its verification/task records; preserve unrelated image-discard changes, including their shared-file hunks, outside the commit. No local candidate activation, GitHub push or deployment was requested.
