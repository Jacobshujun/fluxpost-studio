# Fix Canvas Excel run feedback

## Goal

Make Canvas Excel test runs visibly actionable from the first click and keep the latest node execution state visible across reloads, without changing V2 batch scheduling, review, or Feishu policy.

## Background

- The affected workflow uses `input.competitor-workbook -> utility.prompt-template -> model.gpt-image@2 -> compose.social-post` with title/body and reference-image connections.
- `Run all` is the ordinary single-row/card test path. Full workbook expansion belongs to Canvas V2 batch scheduling.
- The affected saved workbook node currently has no frozen test-row snapshot. Existing schedule child runs reached GPT-Image-2, while the latest image attempts failed with `Image provider network request failed.`
- Workflow run history currently applies the global database limit before filtering by workflow, so unrelated high-volume workflows can hide this workflow's runs. The UI separately projects only successful node runs, which leaves failed nodes looking idle.

## Requirements

- Keep `Run all` as a single workbook row/card test. Do not turn it into an implicit schedule launch.
- Before an ordinary run is created, validate every included enabled competitor-workbook input. Accept scheduler-frozen `rowTitle`/`rowBody`/`cardText` values or a frozen snapshot containing the selected row and card. Otherwise block before queue/provider work.
- A workbook readiness blocker must use a stable blocker code, select/focus the workbook node, explain how to freeze the test row, and offer the existing batch-scheduler entry.
- A run click must immediately show save/preflight progress, wait for an already-running autosave through the existing save coordinator, and reject duplicate run clicks. Autosave alone must not make the run controls silently inert.
- Workflow-scoped run history must filter by workflow before applying its result limit.
- The runs history response must project the latest node attempt across all statuses in addition to the existing latest successful result, with the same workbook-path redaction.
- Default node presentation must show the latest per-node attempt. Explicit historical run selection must continue to show that selected run.
- Failed, blocked, configuration-needed, and cancelled attempts must keep their reason and attempt time visible. A prior successful artifact remains available and clearly labeled when the latest attempt failed.
- Image-network failures continue using the existing durable waiting/requeue behavior and show `waitReason`; do not add a new provider call, health probe, Xray process action, or failure fallback.
- Do not change V2 expansion, concurrency, pause/resume/cancel, retry, aggregation, generated-post serialization, review availability, or Feishu publishing policy.
- Do not mutate historical runs, schedules, generated posts, image configuration, secrets, or provider routes.

## Acceptance Criteria

- [ ] Clicking `Run all` with no valid frozen workbook test row immediately shows an actionable blocker, focuses the workbook node, and creates no run.
- [ ] A valid frozen test row/card can run the ordinary graph once; schedule-frozen workbook values remain compatible.
- [ ] Clicking during autosave waits for the coordinated save and proceeds, while a second click cannot duplicate the run.
- [ ] Workflow-scoped history returns the latest runs even when more recent runs from other workflows exceed the global history limit.
- [ ] Refreshing or switching back to a workflow shows each node's latest attempt, including failure or network wait, while preserving any older successful preview.
- [ ] Workbook paths are redacted from runs, latest attempts, and latest successes returned to the browser.
- [ ] Existing Excel/generic V2 scheduler, image-network recovery, review isolation, and failed-only retry checks continue to pass without live provider or Feishu calls.
- [ ] TypeScript, lint, build, the complete Trellis baseline, and mocked desktop/mobile Canvas checks pass.
- [ ] A clean committed HEAD is activated on port 3001 and the interaction is verified without triggering a real image generation or publish.

## Out Of Scope

- Starting, stopping, or reconfiguring Xray.
- Changing OpenAI image credentials, endpoints, models, retry policy, or historical runtime rows.
- Production push or deployment.
