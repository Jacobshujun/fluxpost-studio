# Technical Design

## Architecture

- `src/lib/original-batches.ts` owns validation, lifecycle, workers and GeneratedPost creation; API routes remain thin.
- `src/lib/xhs-card-series.ts` owns the versioned baoyu-derived catalog, model schemas, selection and deterministic prompt assembly.
- Persistence uses additive `original_batches`, `original_batch_items`, and `original_batch_queue` tables. Domain JSON snapshots hold the complete immutable input, plan, prompt and QA state; indexed columns support owner listing and queue claims.
- The existing single original workflow remains separate and unchanged. Shared provider calls use existing text, vision and image helpers and global concurrency pools.

## Data And State

- Batch statuses: `queued | running | paused | completed | partial | failed | cancelled`.
- Item statuses: `queued | planning | writing | generating | validating | completed | needs_review | failed | cancelled`.
- Card statuses: `planned | generating | validating | completed | needs_review | failed`.
- `GeneratedPost.xhsSeries` contains schema/source versions, strategy/style/layout/palette and ordered cards with prompt, candidates, selected URL and QA result. `imageUrls` is normalized from successful cards in order.
- Worker claims queue rows with PostgreSQL `FOR UPDATE SKIP LOCKED`; SQLite claims inside an immediate transaction. A batch-status join prevents paused/cancelled work from being claimed.
- Provider calls are stage boundaries. Pause/cancel checks run before planning, writing, cover generation, every later-card generation, QA and persistence. In-flight calls are allowed to finish and their result is retained.

## Generation Flow

1. Planning call returns target audience, hook, content type, facts boundary, strategy/style/layout/palette and 2-10 card outlines.
2. Writing call returns title, body, tags and exact per-card text/visual concepts against the frozen plan.
3. Prompt assembly combines catalog, layout, palette, page role, safe zones and exact text into versioned prompts.
4. Cover is generated without a reference. Remaining cards are generated with the cover URL as the sole reference.
5. Vision QA compares each image against expected text and composition. One failed QA result creates a new candidate from the same frozen prompt plus correction notes; a second failure is `needs_review`.
6. A standard draft GeneratedPost is upserted once per item with deterministic ID. Partial cards remain visible for review.

## Interfaces

- `POST /api/original/batches`: `{ items, settings }`; validates all rows and enqueues atomically.
- `GET /api/original/batches`: owner-scoped recent batches.
- `GET /api/original/batches/[id]`: batch plus ordered item details.
- `PATCH /api/original/batches/[id]`: `{ action: pause | resume | cancel | retry_failed }`.
- Frontend advanced defaults: auto strategy/style/layout/palette/image count, web search false.
- ToAPIs and custom-size SSE request 3:4; `openai_json` uses its explicit 1024x1536 capability.

## Compatibility And Rollback

- Existing generated posts without `xhsSeries` keep current array-based review behavior.
- Existing single original API/types stay valid and retain their five-image cap.
- Feishu continues consuming `GeneratedPost.imageUrls`; no publishing schema changes are required.
- Database changes are additive. Code rollback leaves new tables and generated media intact.
- No test invokes live GPT, image providers or Feishu. Live smoke requires separate operator approval.
