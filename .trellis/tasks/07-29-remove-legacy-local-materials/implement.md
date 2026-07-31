# Implementation Plan

1. Replace compact-home legacy material loading, grouping, selection, preview, and request fields with paginated vehicle-library assets and collections.
2. Resolve submitted vehicle asset ids at the authenticated simple-run route and freeze accessible TOS URLs into existing durable run fields.
3. Extend viral material indexing to support HTTP(S) image URLs while retaining historical local-path compatibility.
4. Remove the legacy content-desk UI, API routes, domain modules, shared types, library migration function, database helpers, schema declarations, and SQLite-to-PostgreSQL table entries.
5. Add idempotent SQLite/PostgreSQL retirement of existing legacy tables without filesystem deletion.
6. Update focused verification to assert the new vehicle-library flow and absence of legacy active surfaces.
7. Run focused checks, TypeScript, lint, production build, local restart, authenticated/public HTTP probes as available, and the Trellis baseline.
8. Trigger local database initialization, verify both legacy PostgreSQL tables are absent, and verify original source image paths/files were not deleted by comparing the pre-recorded 121-row inventory boundary.

## Risk And Rollback Points

- Preserve unrelated dirty-worktree edits in `src/app/content/page.tsx`, `src/lib/library-assets.ts`, `src/lib/types.ts`, and `.trellis/verification/*`.
- Do not run destructive filesystem commands against material paths.
- Do not mutate production VPS state.
- Stop before local table retirement if focused verification shows any remaining active reference.
