# Design

## Ownership Boundary

Two owners exist and must not be conflated:

- Queue owner (`feishu_publish_queue.owner_user_id`): who submitted the job.
  Used for visibility and one-running-job-per-user serialization.
- Post owner (`generated_posts.data_json.ownerUserId`): the author. Edits by
  another member (including admins) must not transfer it.

`runtime_posts` is the mutable copy used by the queue and by review side
effects; it must mirror the generated post owner.

## Changes

### 1. Queue persistence returns the generated post

`src/lib/feishu-publish-queue.ts`

- `persistOnePost`: save the generated post, derive the owner actor from the
  saved post, pass that actor to `savePost`, and return `savedPost`.
- `persistRecoveredPostsSerially`: same owner alignment, return `savedPost`.

Returning the runtime copy was the direct cause of the failure: it carried the
acting account as owner and later failed the generated-post access check.

### 2. Review side effects preserve the author

`src/app/api/review/route.ts`

`syncReviewSideEffects` currently calls `savePost(post, account, post)`, which
re-owns the runtime copy to the acting account. Change it to pass an actor
derived from the post author so runtime and generated owners stay aligned.
Admin access is already checked before the save; this only fixes ownership.

### 3. Stale Base record recovery

`src/lib/feishu-cli.ts`

- Add `isMissingFeishuRecordError`, matching code `800030302` plus `not_found`
  in the CLI error/stdout/stderr.
- Add `createFeishuRecordFromPatch`, a record creation without `--record-id`
  that reuses the same field patch.
- On upsert `not_found`, create a replacement record, update
  `mapping.recordId`/`mapping.created`, and keep the write successful.
- Reuse the same helper for the read-back `not_found` recovery path.

`recordMappings` is mutated in place and read when building `postStates`, so the
replacement ID propagates to local post state.

### 4. Data repair

For each `generated_posts`/`runtime_posts` owner mismatch, copy
`ownerUserId` and `ownerDisplayName` from `generated_posts.data_json` into
`runtime_posts.data_json` (and the runtime post's `updated_at`). The repair is
idempotent and only touches owner fields.

## Compatibility

- No schema changes.
- Existing queued jobs resume with the new code after activation; no queue
  format change.
- `runtime_posts` has no consumers other than the queue and review sync today,
  so aligning its owner has no UI impact.

## Rollback

- Revert the fix commit; the queue returns to the old behavior.
- Data repair is reversible only by restoring the previous owner snapshot,
  which is captured in `verification.md` before the update.
