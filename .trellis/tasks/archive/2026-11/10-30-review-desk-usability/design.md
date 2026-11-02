# Review Desk Design

## Boundaries And Sequence

Parent owns requirements and integration. Execute layout, ordering, then filters
sequentially; all touch `src/app/review/page.tsx`. No concurrent file ownership.
Children own implementation and focused evidence; links do not enforce dependencies.
Project Codex mode defaults to inline, not delegation.

## Repository Evidence

- `src/lib/review-posts.ts`: binding, scope, 51-row lookahead, descending
  `(updated_at, id)` sorting and separate overview metadata.
- `src/app/review/use-review-data.ts`: abort/generation guards, save merge,
  10-post detail cache, 200 checks and draft-preserving filter resets.
- `src/lib/use-url-query-state.ts`: atomic `useUrlQueryParams` history commands.
- `src/lib/review-contract.ts`: patch registry and compact summaries.
- `src/app/api/review/route.ts`: separate manual-patch allowlist must change too.
- `src/app/review/page.tsx`: ordinary adjacent moves, index-keyed prompts and
  series lookup that filters out missing cards.
- `src/lib/original-batches.ts:237`: `series.cards[0]` and `card.index > 0`
  control regeneration reference requirements and provider inputs.
- `db/migrations/001_initial_postgres.sql:45` and SQLite schema in
  `src/lib/database.ts`: database creation/update columns already exist.
- `.trellis/verification/review_desk_scroll_layout_check.mjs`: old 1120px
  viewport-lock assertions need requirement-driven replacement.

## Contracts And UX Integration

Filters child owns strict versioned types, calendar helpers, SQL and URL state.
Separate URL relative intent from resolved query bounds; no new storage. Ordering
owns optional ordinary `imagePrompts`, API validation and reload mapping. No
mandatory backfill or schema migration is planned.

Keep UI types, server allowlists and changed-field logic synchronized. Compact
lists must not load full post JSON. Preserve authorization, approval/source side
effects, publish options and drafts that no longer match results.

Layout provides independent-scroll filter/batch surfaces and collapsed AI editor.
Filters populate those surfaces without expanding the list header. Applied and
panel-draft filters are separate. Preserve theme tokens, keyboard dismissal,
focus return and mobile sizing. Ordering uses stable slot/card identity rather
than URL equality or position, including previews and async completion.

## Safety And Rollback

Fixtures intercept/reject unplanned network calls. Browser server disables workers
and rejects port 3001. PostgreSQL uses loopback, unique schemas and finally
cleanup; SQLite uses temporary isolated data. Never touch runtime rows.
Optional prompt fields keep old posts readable. Any later rollback must inspect
task-owned hunks, never restore whole files over user edits. No live provider,
publishing, service or candidate operations.
