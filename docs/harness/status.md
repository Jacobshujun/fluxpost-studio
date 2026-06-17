# Harness Status

Last updated: 2026-06-17

## One-Line Status

Harness context has been converted to lightweight startup, on-demand history, and budget-gated verification; business code is unchanged.

## Current Focus

- Default startup context is under 45 KB by reading only `AGENTS.md`, `docs/harness/status.md`, `docs/harness/feature_list.json`, and `docs/harness/rules.md`.
- Typical code-task Harness context is under 70 KB by using compact `project_brief.md` and `verification.md`, then reading deeper history only by marker, heading, date, keyword, or feature id.
- Old handoff, progress, verification, pitfalls, architecture, and feature evidence are preserved in `docs/harness/archive/`.

## Next Entry

1. For a new task, start with `AGENTS.md`, this file, `docs/harness/feature_list.json`, and `docs/harness/rules.md`.
2. Read `project_brief.md`, `verification.md`, or deeper history only when the task requires it.
3. Use `docs/harness/archive/` for pre-migration history.

## Recent Verification

- 2026-06-17: Full `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1` passed with context budget gates: default startup 28.69 KB, typical code task 47.03 KB, `handoff.md` latest block 661 B, and `progress.md` latest block 738 B.
- 2026-06-16: Full baseline passed after the Dongchedi simple link-mode importer fix.
- 2026-06-16: `node scripts/harness/dongchedi_import_check.mjs`, `link_import_check.mjs`, `simple_link_run_check.mjs`, and `source_import_feishu_check.mjs` passed for the Dongchedi article/comment selection guard.
- 2026-06-16: Full baseline passed after GPT-Image-2 size dispatch and production setting layout fixes.
- 2026-06-16: Full baseline passed after `/review` list scrolling/overlap and Feishu publish queue ownership fixes.

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
