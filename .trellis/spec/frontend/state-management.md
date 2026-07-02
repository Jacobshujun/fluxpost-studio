# State Management

## Local Page State

Use React local state for route-specific UI concerns:

- Selected ids and filters.
- Draft form fields and pending edits.
- Busy states and user messages.
- Preview modals and local display toggles.

Examples:
- `src/app/review/page.tsx` tracks selected posts, the editable draft, Feishu vehicle options, publish snapshots, and preview state locally.
- `src/app/distribution-check/page.tsx` tracks submitted record numbers, queued job state, and audit results locally.

## Server State

Runtime state belongs to backend stores and queues, not browser-only memory:

- Content projects and source items: `src/lib/content-pool.ts`.
- Generated posts: `src/lib/generated-posts.ts`.
- Simple runs: `src/lib/simple-runs.ts`.
- Feishu publish jobs: `src/lib/feishu-publish-queue.ts`.
- Distribution audit jobs: `src/lib/distribution-check.ts`.
- Database adapters and migrations: `src/lib/database.ts` and `db/migrations/001_initial_postgres.sql`.

When UI state changes must persist, call the relevant API route and refresh from the server response.

## Owner Scope

- Browser state can display owner-scoped data, but access control must be enforced by API routes and `src/lib/workspace-accounts.ts` helpers.
- Mutating API routes should require a workspace account before local writes, queue creation, or external provider calls.
- Normal members must only see owner-matched records; admins can access all records through the existing access helpers.

## Durable Jobs

Long work should be represented as durable server-side jobs with progress, not one blocking browser request:

- Simple mode uses `simple_run_queue`.
- Feishu publishing uses `feishu_publish_queue`.
- Distribution audit uses `distribution_check_jobs`.

UI should poll explicit status endpoints and render progress. Do not add hidden browser retries that can duplicate external work.

## Avoid

- Do not store production data only in `useState`.
- Do not mutate `data/`, `public/generated/`, or `public/media/` during Trellis-only or documentation work.
- Do not create client-side fallbacks that hide real API or provider failures.
