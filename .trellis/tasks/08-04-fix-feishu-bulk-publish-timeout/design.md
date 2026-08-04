# Design

## Submission Boundary

`POST /api/publish/feishu` accepts `{ postIds: string[] }`, performs one owner-scoped bulk read, and snapshots the selected posts into one queued `FeishuPublishJob`. Tag enrichment, Feishu field lookup, approval persistence, media recovery, and external writes run only after the worker claims the job.

## Worker Flow

1. Mark progress as `preparing`, bulk-enrich missing source tags by post owner, fetch Feishu vehicle options once, and partition valid and invalid posts.
2. Persist all approved snapshots serially with existing transient database retries. No external write starts before this succeeds.
3. Recover runtime media, then publish valid posts in ordered chunks of 10.
4. After every chunk, persist its post states and record ids, then update the job's processed/succeeded/failed and chunk counters.
5. Convert chunk exceptions into per-post record failures and continue later chunks. A timed-out create has `retrySafe=false` because Feishu may have accepted it without returning ids.
6. Finalize all posts, derive completed/partial/failed status, and send one batch notification.

## Contracts

- `FeishuPublishJob.progress` stores stage, total, processed, succeeded, failed, chunkSize, chunkCount, and completedChunks.
- `FeishuPublishJobResult` stores requested/succeeded/failed counts plus item failures with `postId`, stage, error, and `retrySafe`.
- Progress and result extensions live in queue `data_json`; no SQL migration is required.
- The queue status enum remains unchanged. `queued` and `running` use progress stages; terminal status remains completed/partial/failed/needs_config.

## Compatibility And Safety

- The review client and route change together to the id-only request. Simple runs continue calling the queue domain directly.
- Queue ownership remains the submitting account while each post retains its original owner.
- Equivalent queued/running post-id sets still deduplicate.
- Known record ids and uploaded attachments remain authoritative. No chunk error triggers an automatic external retry.
- Existing unrelated Canvas/database worktree edits must be preserved.
