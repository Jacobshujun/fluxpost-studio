# Harness Rules

Last updated: 2026-06-17

## Context Budgets

- Default startup context must be <= 45 KB.
- Typical code-task Harness context must be <= 70 KB.
- Default startup files are `AGENTS.md`, `docs/harness/status.md`, `docs/harness/feature_list.json`, and `docs/harness/rules.md`.
- Typical code-task files are the default startup files plus `docs/harness/project_brief.md` when product scope, users, product behavior, or technical stack are involved, and `docs/harness/verification.md` before claiming completion.
- Read `pitfalls.md`, `architecture_rules.md`, `decisions.md`, or archive files only by relevant section, heading, date, keyword, feature id, or explicit need.

## Handoff And Progress Reading

- Do not read all of `docs/harness/handoff.md` or `docs/harness/progress.md` during startup.
- When recent history is needed, read only the content between `<!-- HARNESS-LATEST-START -->` and `<!-- HARNESS-LATEST-END -->`.
- If the latest block is not enough, locate deeper history by heading, keyword, date, feature id, or archive path before opening larger sections.

## HARNESS-LATEST Marker Rule

- `handoff.md` and `progress.md`, if present, must include `## 最近一条`.
- The latest entry body must be wrapped exactly by:
  - `<!-- HARNESS-LATEST-START -->`
  - `<!-- HARNESS-LATEST-END -->`
- Each latest marker block must be <= 8 KB.
- The latest block should answer what changed, what remains, where to continue, and what verification matters.

## Handoff Recording

- Do not write every conversation or routine command to `handoff.md` or `progress.md`.
- Write handoff/progress only when a task is unfinished across sessions, a reusable troubleshooting/deployment fact is discovered, a verification fact is durable, or the user explicitly asks.
- Keep `status.md` as the current lightweight entry. Keep long historical records under `docs/harness/archive/`.
- `feature_list.json` is a feature state machine, not a history log. Keep 1-3 evidence entries per feature and archive detailed evidence.

## Harness Self-Check Upgrade

- `scripts/harness/check.ps1` must enforce context budgets and latest-marker size gates before expensive checks.
- If a Harness file grows past budget, first archive or compress the historical content, then update lightweight entries.
- Do not weaken a failing Harness check to make the baseline pass. Fix the real file size, marker, JSON, or documented command issue.

## Quality Rules

- Do not add meaningless fallback code, broad try/catch blocks, silent error swallowing, polling, compatibility branches, or unsupported default values.
- When behavior is uncertain, identify the cause, document unknowns as `待确认`, and verify the explicit fix.
- Default verification must not call external production services or mutate runtime/user data unless the user explicitly asks.
- Do not create a memory, TODO, planning, or handoff system outside `docs/harness/`.
