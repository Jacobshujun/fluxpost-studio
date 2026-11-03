# Implement

## 1. Review In-Progress Changes

- [ ] Inspect the uncommitted diff in `src/lib/feishu-publish-queue.ts`,
  `src/lib/feishu-cli.ts`, `.trellis/verification/feishu_publish_queue_check.mjs`,
  `.trellis/verification/feishu_publish_resume_check.mjs`.
- [ ] Confirm the queue returns `savedPost` and aligns runtime owner.
- [ ] Confirm stale record recovery updates `mapping.recordId`.

## 2. Close The Remaining Source

- [ ] Change `src/app/api/review/route.ts` `syncReviewSideEffects` to save the
  runtime copy with the post author's actor.
- [ ] Add/update a static check in `workspace_accounts_check.mjs` or the resume
  check so the review side effect cannot re-own the post.

## 3. Data Repair

- [ ] Snapshot the mismatched rows (id, generated owner, runtime owner) into
  `verification.md`.
- [ ] Update runtime owner fields from generated owner.
- [ ] Re-run the mismatch query and confirm 0 rows.

## 3b. Attachment Rate Limit

- [ ] Add a process-wide rolling-window reservation for attachment uploads
  (120 files / 60 s).
- [ ] Retry `800050609` up to three attempts with a 65 s delay.
- [ ] Assert the limiter and rate-limit matcher in the Feishu resume check.

## 4. Verification

- [ ] `node .trellis/verification/feishu_publish_queue_check.mjs`
- [ ] `node .trellis/verification/feishu_publish_resume_check.mjs`
- [ ] `node .trellis/verification/workspace_accounts_check.mjs`
- [ ] `npm run lint`
- [ ] `npx --no-install tsc --noEmit`
- [ ] `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`

## 5. Commit And Activate

- [ ] Commit the fix and verification updates.
- [ ] Run `npm run local` from the clean HEAD.
- [ ] Confirm `/api/version` reports the commit and `/review` returns 200.

## 6. Re-Publish

- [ ] Ask the operator before the external Feishu write.
- [ ] Re-publish the affected post; confirm a replacement record is created and
  four attachments upload, or record the explicit Feishu failure.
- [ ] Update `status.md` / `handoff.md` / `verification.md` and archive the task.
