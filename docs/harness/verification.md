# Verification

Last updated: 2026-06-17

## Baseline Command

Run from the project root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1
```

## Current Automated Checks

`scripts/harness/check.ps1` currently verifies:

- Harness file existence and feature-state validity through `scripts/harness/init.ps1`.
- Harness context budgets and `HARNESS-LATEST` marker sizes.
- Handoff validity through `scripts/harness/handoff.ps1`.
- JSON parse checks for project JSON, `docs/harness/feature_list.json`, and existing legacy `data/*.json`.
- Static/domain Harness checks for PostgreSQL schema, workspace accounts, execution logs, platform request mapping, media handling, video-frame policy, concurrency, Feishu publish/resume/queue paths, simple-run policies, source safety, source import, Feishu content import, distribution audit, Lark task launch, crawl strategy sync, source-link importers, simple queue/persistence, title/image prompt guards, GPT-Image-2 request shape, ComfyUI Klein wiring, source tagging image preprocessing, and row-level runtime mutations.
- `npm run lint`.
- `npx --no-install tsc --noEmit`.
- `npm run build`.
- Local production startability smoke on `127.0.0.1:3310` by default, overrideable with `HARNESS_SMOKE_PORT`.
- SQLite store validation through `node scripts/harness/db_check.mjs`.

The baseline must not call live TikHub, OpenAI-compatible text/image services, image providers, ComfyUI, Feishu writes, Lark replies, or simple-run production workflows.

## Manual Smoke Command

When a local server is already running:

```powershell
node scripts/harness/http_smoke.js http://127.0.0.1:3000
```

For the local production server on port `3001`, use the same script with `http://127.0.0.1:3001`.

## Recent Verification

- 2026-06-17: Full baseline passed after the Harness context-budget migration. The new budget gates reported default startup context 28.69 KB / 45 KB, typical code-task context 47.03 KB / 70 KB, `handoff.md` latest block 661 B / 8192 B, and `progress.md` latest block 738 B / 8192 B.
- 2026-06-16: Full baseline passed after the Dongchedi simple link-mode article/comment selection fix. Focused checks included `dongchedi_import_check.mjs`, `link_import_check.mjs`, `simple_link_run_check.mjs`, and `source_import_feishu_check.mjs`.
- 2026-06-16: Full baseline passed after the main production UI image-strategy layout fix and GPT-Image-2 size normalization. Focused check: `image_task_fallback_check.mjs`.
- 2026-06-16: Full baseline passed after `/review` list scrolling/overlap and manual Feishu publish queue ownership fixes. Focused checks: `workspace_accounts_check.mjs` and `feishu_publish_queue_check.mjs`.
- 2026-06-16: Full baseline passed after global GPT-Image-2 request-size options. Focused check: `image_task_fallback_check.mjs`.

## Missing Coverage

- No unit test script is defined in `package.json`.
- No isolated live TikHub, OpenAI-compatible, image-provider, ComfyUI, Feishu, or Lark integration test is part of the default baseline.
- No default end-to-end test posts to `POST /api/simple/runs`, because that workflow can call external providers and Feishu publishing.
- No browser UI walkthrough is part of the baseline.
- No live PostgreSQL service migration or multi-user concurrency test is part of the default baseline.
- `ffmpeg` availability and real video frame extraction are not verified by default.

## Future Check Rules

- Add new baseline checks only when they are deterministic, local, and do not mutate production/runtime data.
- If a check needs live external services, document it as a manual verification target instead of adding it to the default baseline.
- Keep recent verification to the latest 5 entries. Move older verification history to `docs/harness/archive/verification-history.md` or monthly archive files.

## History

- Full pre-migration verification history is preserved at `docs/harness/archive/verification-history.md`.
