# Implementation Plan

1. Add original batch/card types, the versioned XHS catalog, input validation and deterministic prompt assembly.
2. Add PostgreSQL migration plus matching runtime PostgreSQL/SQLite schema and row-level persistence/queue helpers.
3. Implement durable original batch orchestration, two-stage generation, cover anchor chain, vision QA, retry and GeneratedPost projection.
4. Add authenticated collection/detail/action API routes.
5. Build `/original` with TSV ingestion, editable rows, advanced settings, preflight, history/progress and batch actions; add the homepage entry.
6. Extend review rendering and regeneration to preserve structured card metadata and anchor-aware prompts while retaining legacy behavior.
7. Add deterministic checks for catalog/input/API/schema/queue contracts and mocked generation order/partial outcomes.
8. Run focused checks, TypeScript, scoped lint, build, Trellis baseline where available, local restart and responsive browser checks.
9. Update FluxPost status, feature state and stable specs only with verified facts.

## Rollback Points

- Before schema edits: new modules and UI can be removed without data impact.
- After additive migration: rollback application code but retain tables and media.
- Before local restart: verify no unrelated long-running simple or Canvas production task would be interrupted.
