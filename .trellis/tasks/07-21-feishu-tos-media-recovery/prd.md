# Fix Feishu TOS media recovery

## Goal

Permanently recover generated-post media references that still point at deleted local runtime files after the same logical media was persisted to TOS, while preventing one unrecoverable post from blocking the rest of a Feishu publish batch.

## Background

- VPS job `feishu-publish-1784619301693-c703cd73` contained 17 posts and failed when one post still referenced `/media/crawl/feishu/AI7379/{11,22,33}.jpg`.
- The three local files no longer existed because verified TOS persistence removes staging files.
- The corresponding source item already stored verified TOS HTTPS URLs under the exact same logical object keys, but the generated post retained its older URL snapshot.
- The job waited behind another same-owner job before failing, and the current queue response did not expose the number of jobs ahead.

## Requirements

- Recover only app-managed `/media/` and `/generated/` references whose local file is missing.
- Resolve recovery by the complete logical path through the existing TOS HEAD boundary. Do not match by basename or loosely copy source-item arrays.
- Persist each recovered TOS HTTPS URL back to the generated post and current Feishu job before external Feishu writes begin.
- Preserve existing local-file and HTTP(S) behavior, including TOS-disabled operation.
- Preflight attachments per post. A post with unrecoverable media must not create a Feishu Base record, while other valid posts continue.
- Mark a mixed outcome as partial. Successfully written posts become published; failed posts remain approved and carry actionable media failure state.
- Bound remote image materialization to 120 seconds and video materialization to 300 seconds, with temporary cleanup on timeout or failure.
- Expose same-owner queue position and the active blocking job id through the existing polling response.
- Add media repair/failure counts and per-post failure summaries to the JSON-backed job result without a schema migration.
- Do not automatically retry historical failed jobs. The affected 17-post batch requires explicit operator retry after deployment.

## Acceptance Criteria

- [ ] A missing `/media/crawl/feishu/AI7379/11.jpg` local file with an exact verified TOS object resolves to its durable HTTPS URL and that URL is persisted before publish.
- [ ] Existing local files and existing HTTP(S) URLs are not rewritten or unnecessarily looked up in TOS.
- [ ] TOS disabled, missing object, invalid input, HEAD failure, public download failure, and timeout return distinct actionable failures.
- [ ] In a 17-post batch with one unrecoverable post, 16 valid posts publish and the invalid post creates no Base record.
- [ ] If every post fails media preflight, no Feishu record-create command runs and the job fails terminally.
- [ ] Retry continues to reuse persisted Feishu record ids and cannot create duplicate records for already-started posts.
- [ ] Queue polling reports `queueAhead` and `activeJobId` for queued same-owner work.
- [ ] Focused TOS and Feishu checks, type-check, lint, build, full Trellis baseline, and local production refresh pass without live provider calls.
- [ ] Deployment changes only `82.158.226.10`; the old failed job remains untouched until manual retry.

## Out Of Scope

- Bulk rewriting every historical generated post.
- Fuzzy filename matching or arbitrary local filesystem path recovery.
- Automatic replay of failed Feishu jobs.
- Changes to Feishu credentials, target Base configuration, or TOS object layout.
