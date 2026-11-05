# Design

- Add personal canvas_schedule_favorites table, unique owner/schedule, FK cascade; both runtime schemas and migration SQL.
- Explicit GET schedules?view=summary&q=&workflowId=&favorite=true&limit=50&offset=0, SQL scope/search before count/pagination, scalar summary only. Legacy response unchanged.
- Shared types in canvas/types; schedule-favorites domain validates access/input and calls database adapters. PUT/DELETE schedules/[id]/favorite; GET current favorite for center/detail.
- Shared favorite control supports inline alias/note editing. Batch list owns summary loading, search, pagination and stale-request protection. Selected full schedule loaded on demand.
- Existing duplicate action preserves definition, resets execution. Persist dirty edits before copying. V1 copy navigates original canvas, no conversion.
- Metadata queries/writes do not reconcile schedules or wake workers; favorite changes do not touch schedule revision/timestamps.
