# Technical Design

## Data Flow

`session account` -> `launchCanvasSchedule` -> `CanvasSchedule.executionOwner*` -> `CanvasRun.owner*` -> `executeComposition` -> `GeneratedPost.owner*` -> `/api/production/posts` -> review desk.

## Contract

Draft `CanvasSchedule.owner*` is the creator/access owner. `createdByUserId` and `createdByDisplayName` permanently retain that creator. At launch, `owner*` transfers to the authenticated launcher and `executionOwnerUserId` / `executionOwnerDisplayName` freeze the same identity. A compatibility helper returns execution owner when present, otherwise the historical schedule owner for old active schedules.

## Boundaries

- API authentication already supplies the current account; launch is the only point that captures it.
- Scheduler run creation and reconciliation must use one helper so legacy and V2 paths cannot diverge.
- JSONB/SQLite persistence stores the added identity fields without a schema migration. Existing `owner_user_id` columns are updated atomically with JSON when ownership transfers.

## Compatibility

Historical schedules without execution owner continue to run with their current owner. No runtime data migration is performed.
