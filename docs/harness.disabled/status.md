# Harness Status

Last updated: 2026-07-01

## One-Line Status

Manual Feishu publish now normalizes publish `车型` against live Base options before queueing; `小鹏L03` maps to the existing `小鹏MONA L03` option instead of producing `800030005 not_found`.

## Current Focus

- Root cause for liqiong's review-desk failure: manual jobs `feishu-publish-1782886369345-0d36b3fa` and `feishu-publish-1782886633071-efda4b6c` wrote `车型=小鹏L03`, but the target Base table `tblA0EfoAF9J4ffi` only has `小鹏MONA L03`; `lark-cli base +record-batch-create --as bot` returned `api_error 800030005 not_found` before record creation.
- Fix path: `src/lib/feishu-field-options.ts` exposes `normalizeFeishuVehicleValue(...)`, and `src/app/api/publish/feishu/route.ts` preflights manual publish posts through live Base vehicle options before `enqueueFeishuPublishJob(...)`. Unknown values are rejected before queueing; the unique MONA alias is normalized.
- Feishu publish queue remains durable and per-owner serialized. Simple-run Feishu publish had already succeeded for liqiong with `车型=小鹏MONA L03`, so the issue was payload value normalization, not owner queue permissions.
- Current media/import baselines remain: Douyin `modal_id` source links route to single-video detail; video ranking/force-refresh checks cover quality selection; material-library local preview uses `/api/materials/preview`; viral/original/simple-run checks stay in the baseline.
- Default startup context must stay under 45 KB, and typical code-task context under 70 KB. Keep this file lightweight and move history to archives when it grows.

## Next Entry

1. For a new task, start with `AGENTS.md`, this file, `docs/harness/feature_list.json`, and `docs/harness/rules.md`.
2. For Feishu publish issues, inspect `src/lib/feishu-cli.ts`, `src/lib/feishu-publish-queue.ts`, `src/lib/feishu-field-options.ts`, and `src/app/api/publish/feishu/route.ts` first.
3. Before completion, read `docs/harness/verification.md` and run the baseline command or explain why it could not be run.

## Recent Verification

- 2026-07-01: Full baseline passed with `HARNESS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1` after adding manual Feishu publish vehicle normalization. Lint still has the existing 3 warnings only; build still has existing Turbopack dynamic public-path warnings.
- 2026-07-01: Focused Feishu fix checks passed: live read-only `lark-cli base +field-list --as bot --base-token ... --table-id tblA0EfoAF9J4ffi --jq "." --limit 200` confirmed `车型` options include `小鹏MONA L03` and not `小鹏L03`; `node scripts/harness/feishu_vehicle_options_check.mjs`, `npx --no-install tsc --noEmit`, and `npm run lint` passed. Lint still has the existing 3 warnings only. Full baseline was initially blocked by Typical code-task Harness context budget at 70.92 KB, so `status.md` was compressed before rerun.
- 2026-07-01: Full baseline passed with `HARNESS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1` after improving Douyin video ranking and explicit video force-refresh. Server refreshed at `http://127.0.0.1:3001/`.
- 2026-07-01: Full baseline passed with `HARNESS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1` after fixing Douyin search modal source-link routing to `fetch_one_video_v3` via `modal_id`. Server refreshed at `http://127.0.0.1:3001/`.

## Current Risks

- Do not read or expose `.env.local`, `.env*`, database credentials, Feishu/Lark tokens, API keys, local account passwords, or real chat/user identifiers.
- Do not mutate `data/`, `public/generated/`, `public/media/`, debug artifacts, or runtime databases during Harness-only work.
- Do not trigger live TikHub, OpenAI-compatible text/image providers, ComfyUI, Feishu writes, Lark replies, or simple-run production as default verification.
- `handoff.md` and `progress.md` are history libraries now; do not append routine conversation logs there.
- Long historical evidence is archived, not deleted. Use archive files only when the lightweight entry does not answer the task.

## Necessary History Paths

- Full previous handoff: `docs/harness/archive/handoff-history-2026-06-17.md`
- Full previous progress: `docs/harness/archive/progress-history-2026-06-17.md`
- Full previous verification log: `docs/harness/archive/verification-history.md`
- Full previous feature evidence: `docs/harness/archive/feature-list-history-2026-06-17.json`
- Previous pitfalls: `docs/harness/archive/pitfalls-history-2026-06-17.md`
- Previous architecture rules: `docs/harness/archive/architecture-rules-history-2026-06-17.md`

## Handoff Minimum Standard

After reading only `AGENTS.md`, this file, `docs/harness/feature_list.json`, and `docs/harness/rules.md`, a new session must be able to answer:

- Whether the current task is complete.
- If incomplete, what the next step is.
- Which files should be inspected first.
- Which verification should be run.
- What risks and boundaries must not be crossed.

Do not append long deployment, verification, or troubleshooting logs to this file. Put reusable history in the relevant archive file or in the `HARNESS-LATEST` block only when cross-session continuation requires it.
