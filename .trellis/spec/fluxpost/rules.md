# Trellis Rules

Last updated: 2026-07-23

## Context Budgets

- Default startup context must be <= 45 KB.
- Typical code-task Trellis context must be <= 70 KB.
- Default startup files are `AGENTS.md`, `.trellis/spec/fluxpost/status.md`, `.trellis/spec/fluxpost/feature_list.json`, and `.trellis/spec/fluxpost/rules.md`.
- Typical code-task files are the default startup files plus `.trellis/spec/fluxpost/project_brief.md` when product scope, users, product behavior, or technical stack are involved, and `.trellis/spec/fluxpost/verification.md` before claiming completion.
- Read `pitfalls.md`, `architecture_rules.md`, `decisions.md`, or archive files only by relevant section, heading, date, keyword, feature id, or explicit need.

## Handoff And Progress Reading

- Do not read all of `.trellis/spec/fluxpost/handoff.md` or `.trellis/spec/fluxpost/progress.md` during startup.
- When recent history is needed, read only the content between `<!-- TRELLIS-LATEST-START -->` and `<!-- TRELLIS-LATEST-END -->`.
- If the latest block is not enough, locate deeper history by heading, keyword, date, feature id, or archive path before opening larger sections.

## TRELLIS-LATEST Marker Rule

- `handoff.md` and `progress.md`, if present, must include `## 最近一条`.
- The latest entry body must be wrapped exactly by:
  - `<!-- TRELLIS-LATEST-START -->`
  - `<!-- TRELLIS-LATEST-END -->`
- Each latest marker block must be <= 8 KB.
- The latest block should answer what changed, what remains, where to continue, and what verification matters.

## Handoff Recording

- Do not write every conversation or routine command to `handoff.md` or `progress.md`.
- Write handoff/progress only when a task is unfinished across sessions, a reusable troubleshooting/deployment fact is discovered, a verification fact is durable, or the user explicitly asks.
- Keep `status.md` as the current lightweight entry. Keep long historical records under `.trellis/spec/fluxpost/archive/`.
- `feature_list.json` is a feature state machine, not a history log. Keep 1-3 evidence entries per feature and archive detailed evidence.

## Trellis Self-Check Upgrade

- `.trellis/verification/check.mjs` is the cross-platform baseline source of truth and must enforce context budgets and latest-marker size gates before expensive checks. `check.ps1` is a compatibility wrapper only.
- If a Trellis file grows past budget, first archive or compress the historical content, then update lightweight entries.
- Do not weaken a failing Trellis check to make the baseline pass. Fix the real file size, marker, JSON, or documented command issue.

## Quality Rules

- Do not add meaningless fallback code, broad try/catch blocks, silent error swallowing, polling, compatibility branches, or unsupported default values.
- When behavior is uncertain, identify the cause, document unknowns as `待确认`, and verify the explicit fix.
- Default verification must not call external production services or mutate runtime/user data unless the user explicitly asks.
- Code-fix completion evidence must come from the isolated candidate gate plus the deployed bug scenario on staging 104. Do not substitute local application/build/test/browser runs.
- Production 38 may receive only the unchanged full SHA recorded by the successful 104 candidate and release manifests.
- Do not create a memory, TODO, planning, or handoff system outside `.trellis/`.
