# Execution

1. Add native independent launcher, preflight and shared candidate/rollback use.
2. Extend Windows Job-lifetime regression and real heap probe; run focused checks.
3. Update diagnostic contract and state with evidence; run full baseline.
4. Commit only task-related files, archive task, activate clean HEAD with
   `npm run local:lan`, verify listener Job independence/flags and HTTP identity.
5. Store activation evidence in task verification; keep raw logs ignored.

Rollback: existing inactive-slot activation restores previous slot through
the same independent launcher. No data/schema changes.
