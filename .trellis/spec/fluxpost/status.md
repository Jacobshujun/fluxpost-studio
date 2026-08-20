# FluxPost Current Status

Last updated: 2026-08-20

## One-Line Status

The duplicate linked candidate is removed; local startup now permits only the primary worktree, and the complete offline baseline passes after runtime-data recovery.

## Current Focus

- `D:\FluxPost\social-content-studio` is the only project directory and Git worktree; sibling candidates and linked-worktree startup are prohibited.
- The port-3001 restart script resolves Git's common directory and rejects any non-primary worktree before build or listener replacement.
- PostgreSQL business rows remain intact. A validated compatibility SQLite database, 133 exact TOS objects, and 24 header-valid disk-recovery media files were restored; unrecoverable historical local media remains explicitly missing instead of being replaced by corrupt placeholders.
- Focused runtime/SQLite checks and the full offline baseline pass. Existing unrelated dirty changes in `src/lib/canvas/executors.ts` and `canvas_workflows_check.mjs` remain outside this task.

## Next Entry

Commit the primary-worktree guard, then restart the clean committed primary worktree on port 3001; no production deployment was performed.

## Recent Verification

- 2026-08-20: Primary-worktree startup guard, runtime parity, SQLite validation, lint, TypeScript, build, isolated HTTP smoke, and the complete offline baseline passed.
- 2026-08-20: Read-only PostgreSQL counts confirmed 2,693 generated posts, 3,081 runtime posts, 1,377 simple runs, 54 content projects, 10 Canvas workflows, and 7 accounts.
- 2026-08-20: Verified recovery restored 133 exact TOS objects (30,512,581 bytes), 24 valid disk media files, and an integrity-checked SQLite compatibility database without writing corrupt recovery placeholders.

## Risks And Unknowns

- Nine high-severity transitive package advisories remain; do not run npm audit fix --force during routine releases.
- Historical local-only media not present in TOS could not be recovered from NTFS without corruption; PostgreSQL rows remain intact and missing files may require source recache or regeneration.
- Archive refs are local only and intentionally not pushed because they include local task screenshots/evidence.

## History

Earlier evidence remains under .trellis/spec/fluxpost/archive/ and bounded handoff/progress marker blocks.
