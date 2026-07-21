# Design

## Data Flow

1. Load the latest generated posts for a claimed Feishu job.
2. For each image/video reference, keep an existing local file or HTTP(S) URL unchanged.
3. For a missing app-local reference, map its complete logical path to the configured TOS object key and require a successful HEAD with length and ETag.
4. Persist recovered HTTPS references to generated-post stores and the running job before any Feishu CLI write.
5. Prepare attachments per post, partitioning ready and failed posts.
6. Publish only ready posts, merge per-post outcomes, and persist published/approved status independently.

## Boundaries And Contracts

- `runtime-media-materializer.ts` owns local/HTTP/TOS-mirror resolution and bounded downloads. Its result exposes the resolved canonical URL so callers can persist a recovered reference.
- `runtime-media-storage.ts` remains the only TOS SDK boundary; recovery reuses `findExistingRuntimeMedia(publicPath)` and its safe object-key builder.
- `feishu-publish-queue.ts` owns lazy generated-post/job repair before external writes and per-post final persistence.
- `feishu-cli.ts` owns attachment preflight partitioning and must never create a Base record for a post whose required media could not be prepared.
- The publish polling API adds optional `queueAhead` and `activeJobId`. `FeishuPublishJobResult` adds repair/failure counts and compact per-post media failures. Existing fields and statuses remain compatible.

## Failure And Idempotency Rules

- Exact TOS recovery failure leaves the original URL available for a precise preflight error; it never substitutes another source image.
- A partially valid batch returns `attachment_failed`/queue `partial`; an all-invalid batch returns failed without Feishu record creation.
- A post is published only when its record is verified and all required attachments are uploaded or intentionally skipped because it has no media.
- Posts that fail preflight remain approved. Existing `post.feishu.recordId` values remain authoritative on retry.
- Temporary attachment files are cleaned in all paths. Remote fetch uses an abort timeout per media kind.

## Compatibility And Rollback

- No SQL migration is required because job extensions live in `data_json` and generated-post URLs are existing string fields.
- TOS-disabled installations retain local media behavior.
- Rolling back code leaves canonical TOS HTTPS URLs valid for the previous release.
- Existing failed jobs are not mutated or replayed during deployment.
