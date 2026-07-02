# Progress

Last updated: 2026-07-01

This file is an on-demand history library. Current state belongs in `.trellis/spec/fluxpost/status.md`; routine conversation logs should not be appended here.

## 最近一条
<!-- TRELLIS-LATEST-START -->
2026-07-01 Trellis migration work:

Done:
- Installed `@mindfoldhq/trellis` globally; `trellis --version` is `0.6.5`.
- Initialized Trellis with `trellis init --codex -u codex --yes --skip-existing`.
- Migrated FluxPost project context from `docs/harness/` into `.trellis/spec/fluxpost/`.
- Migrated deterministic baseline scripts from `scripts/harness/` into `.trellis/verification/`.
- Renamed old Harness paths to `docs/harness.disabled/` and `scripts/harness.disabled/`.
- Rewrote `AGENTS.md`, `README.md`, `package.json`, `eslint.config.mjs`, and `scripts/local/restart.ps1` to use Trellis paths and ignore disabled archives during lint.
- Added `.trellis/spec/fluxpost/index.md`.
- Filled `.trellis/spec/frontend/` with project-backed FluxPost frontend rules.
- Verified Trellis sees spec layers `fluxpost` and `frontend`.
- Full migrated baseline passed with `TRELLIS_SMOKE_PORT=45678 powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`.
- Archived bootstrap task to `.trellis/tasks/archive/2026-07/00-bootstrap-guidelines/` with `--no-commit`.

Next:
- Use Trellis paths for all future startup, context, task, and verification work.
- Keep `docs/harness.disabled/` and `scripts/harness.disabled/` as disabled migration archives only.
<!-- TRELLIS-LATEST-END -->

## 历史记录

- Full pre-migration progress preserved at `.trellis/spec/fluxpost/archive/progress-history-2026-06-17.md`.
- Full previous verification log preserved at `.trellis/spec/fluxpost/archive/verification-history.md`.
- Full previous feature evidence preserved at `.trellis/spec/fluxpost/archive/feature-list-history-2026-06-17.json`.
