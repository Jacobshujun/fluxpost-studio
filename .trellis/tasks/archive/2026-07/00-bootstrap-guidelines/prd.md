# Bootstrap Task: Fill Project Development Guidelines

## Goal

Populate Trellis with project-specific FluxPost Studio guidance so future AI sessions use real local conventions instead of generic template rules.

## Completed Work

- [x] Trellis CLI installed and initialized for Codex.
- [x] Previous FluxPost context migrated from `docs/harness/` to `.trellis/spec/fluxpost/`.
- [x] Previous deterministic baseline checks migrated from `scripts/harness/` to `.trellis/verification/`.
- [x] Previous Harness directories renamed to disabled migration archives.
- [x] `.trellis/spec/frontend/` populated with project-backed rules from `src/app/page.tsx`, `src/app/review/page.tsx`, `src/app/distribution-check/page.tsx`, `src/app/globals.css`, `src/app/api/**/route.ts`, and `src/lib/**`.
- [x] `.trellis/spec/fluxpost/index.md` added as the FluxPost project context entry point.

## Acceptance Criteria

- [x] `python ./.trellis/scripts/get_context.py --mode packages` lists the `fluxpost` and `frontend` spec layers.
- [x] Frontend spec files contain concrete FluxPost paths and no template placeholder text.
- [ ] Migrated baseline passes through `.trellis/verification/check.ps1`.
- [ ] Task is archived after successful verification.

## Notes

Use `python ./.trellis/scripts/task.py archive 00-bootstrap-guidelines --no-commit` after verification. The `--no-commit` flag avoids Trellis auto-committing in this already-dirty workspace.
