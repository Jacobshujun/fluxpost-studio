# Verification

Last updated: 2026-07-02

## Baseline Command

Run from the project root:

```powershell
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

Equivalent npm shortcut:

```powershell
npm run trellis:check
```

## Current Automated Checks

`.trellis/verification/check.ps1` currently verifies:

- Trellis file existence and feature-state validity through `.trellis/verification/init.ps1`.
- Trellis context budgets and `TRELLIS-LATEST` marker sizes.
- Handoff validity through `.trellis/verification/handoff.ps1`.
- JSON parse checks for project JSON, `.trellis/spec/fluxpost/feature_list.json`, and existing legacy `data/*.json`.
- Static/domain checks for PostgreSQL schema, workspace accounts, execution logs, platform request mapping, media handling, video download fallback, video-frame policy, video transcription wiring, concurrency, Feishu publish/resume/queue/vehicle-option paths, simple-run policies, viral/original modes, review preview/workflow/desktop scroll layout behavior, source safety, source import retirement, Feishu content import, durable distribution audit queue/progress, Lark task launch, crawl strategy sync, source-link importers, simple queue/persistence, title/image prompt guards, GPT-Image-2 request shape, ComfyUI Klein wiring, source tagging image preprocessing, and row-level runtime mutations.
- `npm run lint`.
- `npx --no-install tsc --noEmit`.
- `npm run build`.
- Local production startability smoke on `127.0.0.1:3310` by default, overrideable with `TRELLIS_SMOKE_PORT`. On this Windows host, `3310` is in an excluded TCP range, so use `TRELLIS_SMOKE_PORT=45678`.
- SQLite store validation through `node .trellis/verification/db_check.mjs`.

The baseline must not call live TikHub, OpenAI-compatible text/image services, image providers, ComfyUI, Feishu writes, Lark replies, or simple-run production workflows.

## Manual Smoke Command

When a local server is already running:

```powershell
node .trellis/verification/http_smoke.js http://127.0.0.1:3000
```

For the local production server on port `3001`, use:

```powershell
node .trellis/verification/http_smoke.js http://127.0.0.1:3001
```

## Recent Verification

- 2026-07-02: Full baseline passed with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` after changing compact/simple defaults so `useComfyUiKlein`, `directOriginalReference`, `enableVideoTranscription`, and `writeFeishu` are off unless explicitly enabled. Focused coverage in `.trellis/verification/review_desk_workflow_check.mjs`, `.trellis/verification/simple_link_run_check.mjs`, and `.trellis/verification/comfyui_klein_check.mjs` guards the UI, API, and simple-run normalization contract; `npx --no-install tsc --noEmit` also passed. Lint still has the existing 2 warnings in `src/app/page.tsx`; build still has existing Turbopack dynamic public-path warnings.
- 2026-07-02: Full baseline passed with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` after strengthening viral imitation image reference behavior. Focused coverage in `.trellis/verification/viral_replication_regression_check.mjs` verifies viral source image `referenceUrls` retention, dual-reference edit requests, composition/camera/subject-position prompt constraints, strategy routing for people/text/layout source specs, actual image endpoint logging, and UI pairing notices; `node .trellis/verification/simple_viral_run_check.mjs`, `npx --no-install tsc --noEmit`, and `npm run lint` also passed. Lint still has the existing 2 warnings in `src/app/page.tsx`; build still has existing Turbopack dynamic public-path warnings.
- 2026-07-02: Full baseline passed with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` after changing review-desk approval to save `status: "approved"` and advance to the next unreviewed post without a confirmation dialog. Focused coverage in `.trellis/verification/review_desk_workflow_check.mjs` scopes the no-confirmation assertion to `approveDraft()` while preserving destructive delete confirmations elsewhere. Lint still has the existing 2 warnings in `src/app/page.tsx`; build still has existing Turbopack dynamic public-path warnings.
- 2026-07-02: Full baseline passed with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` after fixing review-desk desktop scrolling for multi-image drafts. Added `.trellis/verification/review_desk_scroll_layout_check.mjs` to verify the desktop frame is viewport-bounded, the main review panel reserves visible action rows, and image/text columns scroll internally. Lint still has the existing 2 warnings in `src/app/page.tsx`; build still has existing Turbopack dynamic public-path warnings.
- 2026-07-02: Full baseline passed with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` after adding review-desk per-image Prompt regeneration and manual paste/upload replacement. Focused coverage in `.trellis/verification/review_desk_workflow_check.mjs` now verifies per-image prompt state, single-image `/api/images` regeneration, multipart `/api/review/images` upload, auth-gated upload routing, image-byte sniffing, and `public/generated/review-uploads` persistence. Lint still has the existing 2 warnings in `src/app/page.tsx`; build still has existing Turbopack dynamic public-path warnings.

## Missing Coverage

- No unit test script is defined in `package.json`.
- No isolated live TikHub, OpenAI-compatible, image-provider, ComfyUI, Feishu, or Lark integration test is part of the default baseline.
- No default end-to-end test posts to `POST /api/simple/runs`, because that workflow can call external providers and Feishu publishing.
- No browser UI walkthrough is part of the baseline.
- No live PostgreSQL service migration or multi-user concurrency test is part of the default baseline.
- `ffmpeg` availability is verified for image-edit reference canvas preparation, but real video frame extraction is not verified by default.

## Future Check Rules

- Add new baseline checks only when they are deterministic, local, and do not mutate production/runtime data.
- If a check needs live external services, document it as a manual verification target instead of adding it to the default baseline.
- Keep recent verification to the latest 5 entries. Move older verification history to `.trellis/spec/fluxpost/archive/verification-history.md` or monthly archive files.

## History

- Full pre-migration verification history is preserved at `.trellis/spec/fluxpost/archive/verification-history.md`.
