# Implementation Plan

1. Extend shared runtime media resolution to recover exact TOS mirrors, return canonical URLs, enforce image/video download timeouts, and preserve cleanup.
2. Add lazy generated-post media repair in the Feishu worker, persist changed posts serially, and update the running job before Feishu CLI calls.
3. Refactor Feishu attachment preparation into per-post ready/failure results; publish only ready posts and merge partial outcomes without blank records.
4. Persist per-post publication status, media repair/failure summaries, and simple-run status accurately.
5. Add owner-scoped queue metadata to database/API polling and update both publish UIs to show jobs ahead and the active job id.
6. Expand deterministic TOS/Feishu regression checks for recovery, missing objects, partial batches, all-invalid batches, timeout cleanup, and idempotent retry.
7. Run focused checks, `npx --no-install tsc --noEmit`, `npm run lint`, `npm run build`, the full Trellis baseline on port 45678, and `npm run local:restart`.
8. Update lightweight Trellis status/spec evidence, deploy only to `82.158.226.10`, verify service health, and leave the old job failed until explicit manual retry.

## Rollback Points

- Shared media resolution can be reverted independently before deployment because no schema changes are involved.
- Stop before VPS deployment if any offline check or local production smoke fails.
- After deployment, use the previous release symlink if service health regresses; do not undo already-canonical TOS URLs.
