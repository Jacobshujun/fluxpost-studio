# Progress

Last updated: 2026-06-17

This file is an on-demand history library. Current state belongs in `docs/harness/status.md`; routine conversation logs should not be appended here.

## 最近一条

<!-- HARNESS-LATEST-START -->
2026-06-17 Harness context-budget migration is complete.

Done:
- Audited current Harness file sizes.
- Identified default startup context as about 500.77 KB under the old protocol, far above the 45 KB budget.
- Identified typical code-task Harness context as about 657.98 KB plus any `project_brief.md` use under the old protocol, far above the 70 KB budget.
- Archived full historical `handoff.md`, `progress.md`, `verification.md`, `feature_list.json`, `pitfalls.md`, and `architecture_rules.md` under `docs/harness/archive/`.
- Added lightweight `status.md`, `rules.md`, compact `handoff.md`, compact `progress.md`, compact `verification.md`, trimmed `feature_list.json`, and context budget gates in `scripts/harness/check.ps1`.
- Verification passed: full `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`; default startup context 28.69 KB; typical code-task context 47.03 KB; latest marker blocks under 8 KB.

Next:
- Use the new startup protocol for future sessions.
- Read archived history only by targeted heading, date, keyword, or feature id when lightweight context is insufficient.
<!-- HARNESS-LATEST-END -->

## 历史记录

- Full pre-migration progress preserved at `docs/harness/archive/progress-history-2026-06-17.md`.
- Full previous verification log preserved at `docs/harness/archive/verification-history.md`.
- Full previous feature evidence preserved at `docs/harness/archive/feature-list-history-2026-06-17.json`.
