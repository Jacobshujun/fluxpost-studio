# Batch Task Favorites

Personal bookmarks reference the source schedule's latest saved definition, never a template snapshot. Alias (1–100 characters), note (up to 1000), created/updated timestamps belong to the bookmarking account, including admins. Writes do not update source schedule revision, status or timestamps.

`canvas_schedule_favorites` has an account/schedule primary key and `ON DELETE CASCADE` to schedules. Runtime PostgreSQL/SQLite schema and migration `008_canvas_schedule_favorites.sql` match. Workflow deletion does not delete schedules: show unavailable workflow and retain unfavorite access.

`GET /api/canvas/schedules?view=summary` accepts `q`, `workflowId`, `favorite=true|false`, `limit=1..100` (default 50) and `offset>=0`. Owner filtering and literal case-insensitive search precede count/paging. Search includes accessible workflow name, task name, current actor alias/note. Summary projection excludes graph, definition and task trees. No-view list keeps the legacy full-response contract. Summary/favorite operations do not reconcile schedules or start workers.

Authenticated `GET|PUT|DELETE /api/canvas/schedules/{id}/favorite` reads, upserts, or removes the current actor's bookmark; access-denied/missing IDs return 404. PUT accepts optional alias/note, defaults to original task name and empty note on first save. DELETE is idempotent for accessible existing tasks. Metadata never appears in other actors' summaries.

The creation entry prefers favorites, otherwise workflows; explicit workflow deep links select workflows. V2 duplicate uses the existing scheduler duplicate action, enters input editing and requires a fresh preview/explicit launch. Save pending edits before copy. V1 duplicates open the original center via Next router navigation, without conversion or an intermediate source URL rewrite. Duplicate drafts are not auto-favorited. Favorite controls synchronize locally across list/detail instances. Queries cancel/ignore stale responses; pages contain 50 summaries.

Verification: `node .trellis/verification/canvas_schedule_favorites_check.mjs`; optional disposable loopback PostgreSQL `node --env-file=.env.local .trellis/verification/canvas_schedule_favorites_check.mjs --postgres`. Browser: `python .trellis/verification/batch_favorites_browser_check.py` and existing `batch_create_browser_check.py`, using worker-disabled isolated `BROWSER_BASE_URL` (never port 3001), with all API/media requests intercepted. No paid model or Feishu calls.
