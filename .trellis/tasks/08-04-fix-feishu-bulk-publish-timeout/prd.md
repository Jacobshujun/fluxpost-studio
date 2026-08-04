# Fix Feishu bulk publish timeouts

## Goal

Keep a 50-post Feishu submission as one durable publish job while removing quantity-sensitive work from the HTTP request and processing records in safe ten-post chunks.

## Background

- The review desk currently sends full post objects, reloads posts individually, validates Feishu vehicle options, enriches tags, and serially persists approved posts before returning `202`.
- Existing persistence must remain serialized because fan-out previously exhausted PostgreSQL connections.
- Feishu record creation currently uses chunks of 50; operators report that manually submitting groups of 10 avoids the timeout.

## Requirements

- Manual publish accepts post ids, bulk-loads owner-visible posts once, creates one durable job, and returns without Feishu CLI calls or per-post persistence.
- The worker enriches, validates, approves, and serially persists posts before any external write.
- Manual and automatic publish jobs create Feishu records in chunks of at most 10.
- Validation or media failures are isolated per post. Valid posts continue; failed posts remain approved with actionable failure details.
- Each completed chunk durably updates record ids, post state, and aggregate progress before the next chunk starts.
- A chunk-level record-creation error is captured for that chunk and later chunks continue. Unknown outcomes are never retried automatically.
- One logical job sends one final notification and exposes requested, processed, succeeded, failed, and chunk counts.
- The review desk polls real progress and restores the latest active manual publish after reload.
- Existing owner separation, duplicate-job detection, record-id reuse, attachment resume, and per-owner queue serialization remain intact.

## Acceptance Criteria

- [x] A 50-id manual request returns one `202` job without synchronous Feishu or serial post-preparation work.
- [x] Counts 1, 10, 11, 50, and 51 use 1, 1, 2, 5, and 6 chunks respectively.
- [x] A failed third chunk preserves earlier results, permits later chunks, and produces one partial terminal result and one notification.
- [x] Per-post vehicle, media, record, and attachment failures do not block valid posts; an all-invalid job creates no records.
- [x] Retries reuse known record ids and attachments; unknown create outcomes are marked unsafe for automatic retry.
- [x] The review desk shows durable aggregate progress and restores an active manual job after reload.
- [x] Focused Feishu/review checks, TypeScript, lint, build, full Trellis baseline, and local production restart pass without live Feishu writes.

## Out Of Scope

- Live 50-post Feishu validation.
- Production deployment.
- Database schema changes or automatic replay of interrupted external writes.
