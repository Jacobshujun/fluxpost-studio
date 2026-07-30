# Verification

Last updated: 2026-07-30

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
- Static/domain checks for PostgreSQL schema, workspace accounts, role-aware libraries, advanced config, TOS/runtime media, build/deploy contracts, execution logs, platform mapping, HEIC/media/video behavior, concurrency, Feishu flows, production/review/crawl policies, GPT-Image-2/ToAPIs, ComfyUI, source tagging, infinite-canvas graph/common-node/text-split/display-any/vision/media/quick-add contracts, and row-level runtime mutations.
- `npm run lint`.
- `npx --no-install tsc --noEmit`.
- `npm run build`.
- Local production startability smoke on `127.0.0.1:3310` by default, overrideable with `TRELLIS_SMOKE_PORT`. On this Windows host, `3310` is in an excluded TCP range, so use `TRELLIS_SMOKE_PORT=45678`. The smoke child receives `FLUXPOST_DISABLE_BACKGROUND_WORKERS=1` so it cannot advance persisted Canvas work.
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

- 2026-07-30: Local Infinite Canvas zoom phase 1 enabled visible-element culling, reduced idle edges to one business path, limited beam paths to selected or queued/running-related edges, and suspended beam animation/filters during pan/zoom and reduced-motion. Focused Canvas checks, TypeScript, scoped lint, two production builds, local restart/HTTP smoke, and a mocked Chromium DOM/computed-style check passed without external calls; the required wrapper still cannot start because its delegated `check.mjs` is absent.
- 2026-07-28: Copy library and Canvas batch copy integration passed `copy_library_check.mjs`, `canvas_scheduler_check.mjs`, TypeScript, focused lint, build/restart, HTTP smoke, and mocked desktop/mobile creation, tags, sharing, picker, scheduling, and overflow checks. Playwright exposed and verified the fix for delayed draft synchronization erasing fast input. The full baseline passed every domain check and stopped only at the unrelated untracked `.tmp-canvas-common-nodes-browser-check.cjs` lint error.
- 2026-07-28: Canvas startup recovery/terminal wakeup passed `canvas_scheduler_check.mjs`, TypeScript, focused lint, full lint with the unrelated `.tmp-canvas-common-nodes-browser-check.cjs` excluded, build/restart, isolated no-worker HTTP smoke, and read-only local PostgreSQL observation. The full baseline passed all domain checks through Canvas and stopped only at that unrelated temporary-script lint error. After the user-authorized real restart, review draft count advanced from 0 to 2 while sibling content tasks remained active.
- 2026-07-27: Canvas collapsible node library, compact run bar, cross-workflow task/history query center, prompt-free enqueue, and shortcuts passed deterministic checks, TypeScript, focused lint, build/restart, HTTP smoke, and mocked 1440x960/390x844 checks without external calls. Palette collapse expanded the 1440px viewport stage from 872px to 1120px; full baseline passed through Canvas and remains blocked only by unrelated `.tmp-canvas-common-nodes-browser-check.cjs` lint.
- 2026-07-27: Canvas all-node resizing, text-split V2, and ToAPIs 100-slot concurrency passed focused checks, TypeScript, focused lint, build/restart, `/canvas` HTTP 200, and mocked desktop/mobile checks without paid calls. Sizes persist within `190x120..720x900` across reload/clipboard while mobile stays compact without handles. Full baseline reached lint and stopped only on unrelated untracked `.tmp-canvas-common-nodes-browser-check.cjs`.
- Older 2026-07-23 library and HEIC/TOS verification is preserved in `archive/verification-history.md`.

## Missing Coverage

- Infinite canvas has deterministic graph/API/DAG and mocked desktop/mobile coverage, but no live Seedance submission/query, real Feishu write, PostgreSQL migration execution, or multi-user concurrency test. Keep those as operator-approved/manual gates.
- TOS has real application image evidence; authenticated `/config` and real video checks remain.

- No unit test script is defined in `package.json`.
- No isolated live TikHub, OpenAI-compatible, image-provider, ComfyUI, Feishu, or Lark integration test is part of the default baseline.
- No default end-to-end test posts to `POST /api/simple/runs`, because that workflow can call external providers and Feishu publishing.
- No browser UI walkthrough is part of the default baseline; the HEIC/TOS task uses a separate local browser smoke script.
- No live PostgreSQL service migration or multi-user concurrency test is part of the default baseline.
- No default check installs packages or performs a real clean-host Ubuntu bootstrap, DNS change, Caddy certificate request, or firewall operation. The deployment check parses Compose, runs Bash syntax, and executes private/HTTPS/legacy `deploy.sh --check` plans without Docker or network access.
- `ffmpeg` availability is verified for image-edit reference canvas preparation, but real video frame extraction is not verified by default.

## Future Check Rules

- Add new baseline checks only when they are deterministic, local, and do not mutate production/runtime data.
- If a check needs live external services, document it as a manual verification target instead of adding it to the default baseline.
- Keep recent verification to the latest 5 entries. Move older verification history to `.trellis/spec/fluxpost/archive/verification-history.md` or monthly archive files.

## History

- Full pre-migration verification history is preserved at `.trellis/spec/fluxpost/archive/verification-history.md`.
