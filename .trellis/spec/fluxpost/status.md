# Trellis Status

Last updated: 2026-07-02

## One-Line Status

Trellis is now the active project context system: CLI 0.6.5 is installed, `.trellis/spec/fluxpost` holds migrated FluxPost context, `.trellis/verification` holds migrated baseline scripts, and old Harness directories are disabled archives.

## Current Focus

- Trellis install source: `npm install -g @mindfoldhq/trellis@latest`; `trellis --version` reports `0.6.5`.
- Initialization command used: `trellis init --codex -u codex --yes --skip-existing`; it created `.trellis/`, `.codex/`, and `.agents/skills/` without overwriting the existing `AGENTS.md`.
- Previous context under `docs/harness/` was copied to `.trellis/spec/fluxpost/`.
- Previous checks under `scripts/harness/` were copied to `.trellis/verification/`.
- Original Harness paths were renamed to `docs/harness.disabled/` and `scripts/harness.disabled/`; they are migration archives, not active sources.
- Trellis spec discovery sees `fluxpost` and `frontend` via `python ./.trellis/scripts/get_context.py --mode packages`.
- Full baseline passed with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` after strengthening viral imitation image prompts, strategy routing, pairing notices, and image endpoint logging.
- Trellis bootstrap task was archived to `.trellis/tasks/archive/2026-07/00-bootstrap-guidelines/` with `--no-commit`.
- Default startup context must stay under 45 KB, and typical code-task context under 70 KB. Keep this file lightweight and move history to archives when it grows.

## Next Entry

1. For a new task, start with `AGENTS.md`, this file, `.trellis/spec/fluxpost/feature_list.json`, and `.trellis/spec/fluxpost/rules.md`.
2. For Feishu publish issues, inspect `src/lib/feishu-cli.ts`, `src/lib/feishu-publish-queue.ts`, `src/lib/feishu-field-options.ts`, and `src/app/api/publish/feishu/route.ts` first.
3. Before completion, read `.trellis/spec/fluxpost/verification.md` and run `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`, or explain why it could not run.

## Recent Verification

- 2026-07-02: GitHub sync prep added a `Latest Updates (2026-07-02)` section to `README.md` summarizing Trellis migration, review-desk improvements, simple/original/viral flows, video/image handling, Feishu vehicle/distribution updates, and deterministic local verification coverage. Full baseline with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` passed. Lint still has the existing 2 warnings in `src/app/page.tsx`; build still has existing Turbopack dynamic public-path warnings.
- 2026-07-02: Compact/simple mode now defaults `useComfyUiKlein`, `directOriginalReference`, `enableVideoTranscription`, and `writeFeishu` off in the UI and simple-run API/domain normalization. `.trellis/verification/review_desk_workflow_check.mjs`, `.trellis/verification/simple_link_run_check.mjs`, and `.trellis/verification/comfyui_klein_check.mjs` now guard the default-off contract. `node .trellis/verification/review_desk_workflow_check.mjs`, `node .trellis/verification/simple_link_run_check.mjs`, `node .trellis/verification/comfyui_klein_check.mjs`, `npx --no-install tsc --noEmit`, and full baseline with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` passed. Lint still has the existing 2 warnings in `src/app/page.tsx`; build still has existing Turbopack dynamic public-path warnings.
- 2026-07-02: Review desk add-image upload now sends `/api/review/images` append requests with the last persisted post image count instead of the unsaved local draft image count, preventing `Image index is invalid` when importing multiple new images before saving. `.trellis/verification/review_desk_workflow_check.mjs` now guards this contract. `node .trellis/verification/review_desk_workflow_check.mjs`, `node .trellis/verification/review_preview_layout_check.mjs`, `node .trellis/verification/review_desk_scroll_layout_check.mjs`, `npx --no-install tsc --noEmit`, and full baseline with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` passed. Lint still has the existing 2 warnings in `src/app/page.tsx`; build still has existing Turbopack dynamic public-path warnings.
- 2026-07-02: Viral imitation image generation now uses the viral source image as a composition, camera distance, subject placement, scene atmosphere, lighting, color, and visual-rhythm reference while preserving safety boundaries against copying source watermarks, plates, text, brands, or exact content. `recommendedStrategy` now routes to the matching image strategy prompt, simple viral runs expose pairing coverage when vehicle materials cover only part of the viral source images, and OpenAI image request logs report the actual `images/edits` or `images/generations` endpoint path. `node .trellis/verification/viral_replication_regression_check.mjs`, `node .trellis/verification/simple_viral_run_check.mjs`, `npx --no-install tsc --noEmit`, `npm run lint`, and full baseline with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` passed. Lint still has the existing 2 warnings in `src/app/page.tsx`; build still has existing Turbopack dynamic public-path warnings.
- 2026-07-02: Review desk add-image now opens an upload panel instead of immediately activating a hidden file picker. The panel supports local file import, clipboard paste import, and drag-drop import while still appending through `/api/review/images` in `mode=append` and requiring the existing review save action to persist the draft. `node .trellis/verification/review_desk_workflow_check.mjs`, `npx --no-install tsc --noEmit`, full baseline with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`, and `npm run local:restart` passed. Lint still has the existing 2 warnings in `src/app/page.tsx`; build still has existing Turbopack dynamic public-path warnings.
- 2026-07-02: Review desk content/gallery area now supports manually adding a new image through a dedicated add-image upload/paste tile. `/api/review/images` accepts `mode=append` only at the current end-of-list image index, while uploaded media is still persisted under `public/generated/review-uploads` and saved to the post only through the existing `/api/review` draft save path. `node .trellis/verification/review_desk_workflow_check.mjs`, `npx --no-install tsc --noEmit`, full baseline with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`, and `npm run local:restart` passed. Lint still has the existing 2 warnings in `src/app/page.tsx`; build still has existing Turbopack dynamic public-path warnings.
- 2026-07-02: Review desk approval now saves `status: "approved"` and advances to the next unreviewed post without a confirmation dialog. `.trellis/verification/review_desk_workflow_check.mjs` now scopes the no-confirmation assertion to `approveDraft()` while preserving destructive delete confirmations elsewhere. `node .trellis/verification/review_desk_workflow_check.mjs`, `npx --no-install tsc --noEmit`, full baseline with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`, and `npm run local:restart` passed. Lint still has the existing 2 warnings in `src/app/page.tsx`; build still has existing Turbopack dynamic public-path warnings.
- 2026-07-02: Review desk now shares the main workspace theme helper through `src/lib/theme.ts`, applies stored theme from `src/app/layout.tsx`, exposes a review-page theme switcher, keeps top return/refresh actions visible without header clipping, and adds preview-modal image deletion plus Prompt generation buttons wired to existing review image actions. `node .trellis/verification/review_preview_layout_check.mjs`, `node .trellis/verification/review_desk_scroll_layout_check.mjs`, `node .trellis/verification/review_desk_workflow_check.mjs`, `npx --no-install tsc --noEmit`, and full baseline with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` passed. Lint still has the existing 2 warnings in `src/app/page.tsx`; build still has existing Turbopack dynamic public-path warnings.
- 2026-07-02: Review desk desktop layout now keeps title, action buttons, and AI edit area visible while image/text columns scroll internally for multi-image drafts. Added `.trellis/verification/review_desk_scroll_layout_check.mjs` to the baseline. `node .trellis/verification/review_desk_scroll_layout_check.mjs`, `node .trellis/verification/review_desk_workflow_check.mjs`, `npx --no-install tsc --noEmit`, and full baseline with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` passed. Lint still has the existing 2 warnings in `src/app/page.tsx`; build still has existing Turbopack dynamic public-path warnings.
- 2026-07-02: Review desk removed the redundant post-level `图片 Prompt` editor while preserving per-image Prompt fields, one-image regeneration through `/api/images`, and manual paste/upload replacement through auth-gated `/api/review/images`. `node .trellis/verification/review_desk_workflow_check.mjs`, `npx --no-install tsc --noEmit`, and full baseline with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` passed. Lint still has the existing 2 warnings in `src/app/page.tsx`; build still has existing Turbopack dynamic public-path warnings.
- 2026-07-01: Content review preview modal image fit fixed. `node .trellis/verification/review_preview_layout_check.mjs`, full baseline with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`, `npm run local:restart`, and a headless Playwright layout check against `http://127.0.0.1:3001/review` passed. Lint still has the existing 2 warnings in `src/app/page.tsx`; build still has existing Turbopack dynamic public-path warnings.
- 2026-07-01: Trellis migration completed. `trellis --version` is `0.6.5`; `python ./.trellis/scripts/get_context.py --mode packages` lists `fluxpost, frontend`; full migrated baseline passed with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`. Lint has the existing 2 warnings in `src/app/page.tsx`; build has existing Turbopack dynamic public-path warnings.
- 2026-07-01: Full baseline passed with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` after adding manual Feishu publish vehicle normalization. Lint still has the existing 3 warnings only; build still has existing Turbopack dynamic public-path warnings.
- 2026-07-01: Full baseline passed with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` after improving Douyin video ranking and explicit video force-refresh. Server refreshed at `http://127.0.0.1:3001/`.

## Current Risks

- Do not read or expose `.env.local`, `.env*`, database credentials, Feishu/Lark tokens, API keys, local account passwords, or real chat/user identifiers.
- Do not mutate `data/`, `public/generated/`, `public/media/`, debug artifacts, or runtime databases during Trellis-only work.
- Do not trigger live TikHub, OpenAI-compatible text/image providers, ComfyUI, Feishu writes, Lark replies, or simple-run production as default verification.
- Do not use `docs/harness.disabled/` or `scripts/harness.disabled/` as active context/check paths unless explicitly doing migration archaeology.
- `handoff.md` and `progress.md` are history libraries now; do not append routine conversation logs there.
- Long historical evidence is archived, not deleted. Use archive files only when the lightweight entry does not answer the task.

## Necessary History Paths

- Full previous handoff: `.trellis/spec/fluxpost/archive/handoff-history-2026-06-17.md`
- Full previous progress: `.trellis/spec/fluxpost/archive/progress-history-2026-06-17.md`
- Full previous verification log: `.trellis/spec/fluxpost/archive/verification-history.md`
- Full previous feature evidence: `.trellis/spec/fluxpost/archive/feature-list-history-2026-06-17.json`
- Previous pitfalls: `.trellis/spec/fluxpost/archive/pitfalls-history-2026-06-17.md`
- Previous architecture rules: `.trellis/spec/fluxpost/archive/architecture-rules-history-2026-06-17.md`

## Handoff Minimum Standard

After reading only `AGENTS.md`, this file, `.trellis/spec/fluxpost/feature_list.json`, and `.trellis/spec/fluxpost/rules.md`, a new session must be able to answer:

- Whether the current task is complete.
- If incomplete, what the next step is.
- Which files should be inspected first.
- Which verification should be run.
- What risks and boundaries must not be crossed.

Do not append long deployment, verification, or troubleshooting logs to this file. Put reusable history in the relevant archive file or in the `TRELLIS-LATEST` block only when cross-session continuation requires it.
