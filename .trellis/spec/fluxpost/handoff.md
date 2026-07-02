# Handoff

Last updated: 2026-07-01

This file is an on-demand history library. Do not read it during default startup; read the latest marker block only when recent cross-session history is needed.

## 最近一条
<!-- TRELLIS-LATEST-START -->
2026-07-01 Trellis migration replaced the active Harness context.

Current entry points:
- Startup: `AGENTS.md`, `.trellis/spec/fluxpost/status.md`, `.trellis/spec/fluxpost/feature_list.json`, `.trellis/spec/fluxpost/rules.md`.
- Completion verification: `.trellis/spec/fluxpost/verification.md`, then `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`.
- Trellis CLI: `trellis --version` reports `0.6.5`; Codex integration files were generated under `.codex/` and `.agents/skills/`.
- Active spec layers: `fluxpost` and `frontend`.

Migration facts:
- Old `docs/harness/` was copied to `.trellis/spec/fluxpost/`.
- Old `scripts/harness/` was copied to `.trellis/verification/`.
- Old directories were renamed to `docs/harness.disabled/` and `scripts/harness.disabled/`; do not use them as active context/check paths.

Verification complete:
- Full migrated baseline passed with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`.
- `python ./.trellis/scripts/task.py list` shows no active tasks.
- Bootstrap task archived under `.trellis/tasks/archive/2026-07/00-bootstrap-guidelines/`.
<!-- TRELLIS-LATEST-END -->

## 历史记录

- Full pre-migration handoff preserved at `.trellis/spec/fluxpost/archive/handoff-history-2026-06-17.md`.
- Use heading, date, keyword, or feature id search before opening long archive sections.
