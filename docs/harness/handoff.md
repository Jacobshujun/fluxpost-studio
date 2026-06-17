# Handoff

Last updated: 2026-06-17

This file is an on-demand history library. Do not read it during default startup; read the latest marker block only when recent cross-session history is needed.

## 最近一条

<!-- HARNESS-LATEST-START -->
2026-06-17 Harness budget migration completed. The project now uses lightweight startup plus on-demand history and baseline budget gates, without touching business code.

Current entry points:
- Startup: `AGENTS.md`, `docs/harness/status.md`, `docs/harness/feature_list.json`, `docs/harness/rules.md`.
- Completion verification: `docs/harness/verification.md`, then `powershell -ExecutionPolicy Bypass -File scripts/harness/check.ps1`.
- Full prior handoff evidence: `docs/harness/archive/handoff-history-2026-06-17.md`.

Verification passed on 2026-06-17: full Harness baseline, with default startup context at 28.69 KB and typical code-task context at 47.03 KB.

Important boundary: only `AGENTS.md`, `docs/harness/**`, and `scripts/harness/check.ps1` are in scope for this migration.
<!-- HARNESS-LATEST-END -->

## 历史记录

- Full pre-migration handoff preserved at `docs/harness/archive/handoff-history-2026-06-17.md`.
- Use heading, date, keyword, or feature id search before opening long archive sections.
