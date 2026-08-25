# Technical Design

## Boundary

Canvas execution owns operational state (`partial`, failed indices, run history). Generated posts own reviewable content only. The boundary is enforced by removing `canvasImageBatch` from `GeneratedPost` and every Canvas-to-review serialization path.

## Scheduling And Aggregation

- Remove scheduler code that synthesizes review-layer `imageBatch=partial` metadata.
- Keep V2 completion based only on the existing aggregation policy and eligible child results.
- Keep historical `taskConcurrency` parsing for compatibility, with no admission gate.
- Preserve internal V1/V2 task artifacts and schedule/node-run partial diagnostics where they are needed to render Canvas execution state.

## Review And Publish

- Review UI derives availability only from existing publish-mode requirements, approval state, body/vehicle/media validation, and queue state.
- Canvas publish executor and `feishu-publish-queue` do not inspect `canvasImageBatch`.
- Legacy JSON payloads may still contain the key until maintenance runs; runtime readers tolerate it without acting on it.

## Retry

- Revert the partial-specific branches introduced by the recent retry change at V1 image task, V2 child, V2 row, shared stage, schedule, and node-run presentation boundaries.
- Retain existing retry predicates for terminal failure/configuration states.

## Maintenance Command

- Add a script under `scripts/db/` and a package command.
- Resolve the configured runtime backend using the same environment conventions as existing DB maintenance tools.
- Dry-run reports backend, count, and post ids only.
- SQLite apply runs one transaction and rewrites only JSON payloads containing the key while preserving row metadata columns.
- PostgreSQL apply runs one transaction using JSONB key deletion on the payload column; no timestamp column is updated.
- The command never touches Canvas history tables.

## Rollout

1. Verify and commit code/tests.
2. Confirm no unsafe active Canvas/Feishu work before restart.
3. Activate clean HEAD on port 3001.
4. Run maintenance dry-run, apply, then a final dry-run/count check.
5. Browser-check review controls without publishing.

## Rollback

Code rollback is commit-based. Historical cleanup removes only a derived policy key; no content rollback is required because title, body, media, status, timestamps, and Canvas history are unchanged.
