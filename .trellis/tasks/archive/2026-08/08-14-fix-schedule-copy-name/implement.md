# Implementation Plan

1. Add a local batch-schedule copy-name helper and call it with the existing `now` value from `duplicateCanvasSchedule()`.
2. Extend `canvas_scheduler_check.mjs` with base, legacy suffix, stacked suffix, timestamp suffix, Beijing-time, and existing V2-copy assertions.
3. Run the focused scheduler check, TypeScript/lint as needed, and the complete Trellis baseline on port `45678`.
4. Review task-owned paths and secrets/runtime exclusions, then commit and push the dedicated candidate branch and verify remote full-SHA equality.
5. Run the installed production candidate verifier and read-only preflight. Present the full SHA and evidence for the required exact-SHA approval gate.
6. Deploy only the approved full SHA, verify identity/health/auth/workers/schema/volumes/protected services/rollback, then fast-forward GitHub `main` and update Trellis release evidence.

## Rollback Points

- Any local, isolated, or preflight failure blocks production mutation.
- Deployment activation failure relies on automatic restoration of the previous release.
- A failed post-deploy gate triggers manifest-aware rollback to the captured release without deleting volumes.
- The original dirty root worktree is never reset, cleaned, staged, or committed.
