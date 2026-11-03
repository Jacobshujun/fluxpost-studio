# 修复飞书发布归属污染与失效记录

## Goal

Restore Feishu publishing when a post is authored by one member and finally
reviewed/published by another (for example, 李琼 authors the post and Jacob
approves and writes it to Feishu).

## Root Cause

Two independent defects were confirmed from job data and execution logs:

1. Ownership divergence. `/api/review` side effects wrote the acting account
   into `runtime_posts`, so an admin edit changed the runtime owner while
   `generated_posts` kept the author. The Feishu queue persisted posts from the
   runtime copy, then `saveGeneratedPost` rejected the mismatched owner and the
   whole job failed with `Generated post not found`.
2. Stale Base record IDs. A saved `feishu.recordId` can disappear from the Base
   (`800030302 not_found`). The queue retried the dead ID forever and reported
   `record_failed` instead of creating a replacement record.

Evidence: failed jobs `feishu-publish-1793684841877-9018c98e` and
`feishu-publish-1793685525729-1ef79c85`; nine `generated_posts`/`runtime_posts`
owner mismatches on 2026-11-03.

## Requirements

- R1: Editing or approving a post must never change the post author. The acting
  account may access and publish it, but `ownerUserId`/`ownerDisplayName` stay
  with the original author.
- R2: Feishu queue persistence must use the saved generated post, not the
  runtime copy, and must align the runtime owner back to the generated owner.
- R3: A Feishu record `not_found` (code `800030302`) during field write must
  create a replacement record from the same patch and persist its new ID.
- R4: Existing generated/runtime owner divergences must be repaired from the
  generated post, with before/after evidence.
- R5: Do not change publishing modes, chaptering, validation rules, attachment
  limits, or notification content.

## Acceptance Criteria

- [ ] `saveGeneratedPost` success no longer depends on the acting account
  matching the runtime owner.
- [ ] Runtime and generated owners match after a publish and after an admin
  edit.
- [ ] Stale record IDs are replaced by a newly created record and the job
  reports `record_failed`/`attachment_failed`/`published` from the real
  Feishu outcome instead of `Generated post not found`.
- [ ] Owner mismatch count is 0 after the data repair.
- [ ] Targeted Feishu checks, TypeScript, lint and the full Trellis baseline
  pass.
- [ ] The fix is committed and the 3001 candidate is rebuilt from clean HEAD.
- [ ] Re-publishing the affected post succeeds or reports an explicit,
  actionable Feishu failure.

## Out Of Scope

- Attachment rate limiting/backoff for very large batches (separate follow-up).
- Deleting or deduplicating Base records already created.
- Changing reviewer permissions or workspace roles.
