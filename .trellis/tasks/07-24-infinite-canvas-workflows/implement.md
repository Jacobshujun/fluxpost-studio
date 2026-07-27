# Infinite Canvas Workflows V1 Implementation

## Ordered Work

- [x] Install `@xyflow/react` and add shared canvas types, browser-safe node definitions, artifact ports, config validators, graph normalization, cycle detection, and execution planning.
- [x] Add PostgreSQL migration plus SQLite schema/adapters for workflows, runs, node attempts, and run queue, preserving current database backend behavior.
- [x] Add owner-scoped workflow service and thin workflow API with list/get/create/update/duplicate/template-copy/delete and revision conflicts.
- [x] Add durable run service, queue claim/heartbeat/completion helpers, confirmation planning, selected-node closure, cancellation, retry, and worker scheduling.
- [x] Add generic GPT text output, GPT-Image-2, input media, social-post composition, and Feishu publish node executors.
- [x] Add the Dreamina CLI wrapper and Seedance node with configuration status, credit preflight, strict argument mapping, task id persistence, query continuation, and deterministic mock tests.
- [x] Build `/canvas` with palette, graph, inspector, workflow commands, autosave, validation feedback, confirmation dialog, run dock, results, and mobile inspect/run behavior.
- [x] Add navigation entry points without restructuring unrelated existing pages.
- [x] Add deterministic Trellis checks and mock browser checks for graph editing, API shapes, run progress, errors, desktop, and mobile.
- [x] Run focused checks, TypeScript, lint, build, full Trellis baseline, `npm run local:restart`, and Playwright screenshots/canvas-pixel inspection.
- [x] Update feature state and stable Trellis specs only with verified facts.
- [x] Add a validated versioned node clipboard protocol with copy, cut, paste, duplicate, delete, internal-edge preservation, and collision-free ids.
- [x] Add authenticated canvas image upload, file/clipboard import, fixed 1-4 tile node galleries, thumbnail removal, 50%-400% full preview zoom, and automatic “图片” node creation.
- [x] Extend deterministic and browser coverage for clipboard focus guards, pasted-node placement, live node-gallery updates, preview zoom/reset/close, theme compatibility, and responsive layout.

- [x] Add GPT-Image-2 v2 definitions, v1-to-v2 editable graph migration, and strict ordered 16-image input resolution.
- [x] Update ToAPIs and standard OpenAI adapters for one-request multi-image generation, `image_urls`, `n=1-10`, format/compression, and no four-image truncation.
- [x] Add direct GPT image uploads, reorder/delete/count controls, ratio-aware result previews, latest-success projection, and loaded pixel dimensions.
- [x] Reduce flowing-edge core/halo widths and verify normal, selected, and reduced-motion states.
- [x] Add focused provider, executor, migration, API, and browser assertions, then run the full completion baseline and local restart.
- [x] Make left-button canvas panning explicit and preserve open-hand/closed-hand cursor feedback with deterministic coverage.

## Verification

```powershell
node .trellis/verification/canvas_workflows_check.mjs
npx --no-install tsc --noEmit
npm run lint
npm run build
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
npm run local:restart
```

Browser verification uses mocked APIs and does not submit paid or external work. A live Seedance or Feishu smoke requires separate operator confirmation.

## Risk And Rollback

- Keep new canvas logic in dedicated modules so removing the route/API/migration wiring disables the feature without altering existing simple-run and review workflows.
- Do not rewrite existing dirty files wholesale. Patch shared database, config, type, navigation, and Trellis files around current user changes.
- Treat provider submission ids and Feishu job ids as idempotency evidence. Do not replace explicit failure states with fallback success.
