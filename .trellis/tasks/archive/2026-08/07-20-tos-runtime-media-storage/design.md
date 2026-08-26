# Technical Design

## Storage Boundary

Add one runtime-media storage owner around the official `@volcengine/tos-sdk` client. Producers continue to create a validated local file when transformation requires one, then call the shared boundary with a logical runtime path, content type, and overwrite policy.

When TOS is disabled, the boundary returns the current app-relative URL and keeps the file. When enabled it:

1. Maps the logical path under `fluxpost/flux-lightmoment`.
2. Reuses a verified existing object for normal deterministic cache writes or overwrites for explicit refreshes.
3. Uploads with object ACL `public-read`, retries transient provider failures, and verifies `content-length` using `headObject`.
4. Builds the public HTTPS URL from the configured bucket domain plus an ETag-derived `v` query.
5. Deletes the local staging file only after verification.

Failure moves the file into `data/tos-pending` while preserving its object-key layout and throws an explicit provider error. No credential or provider authorization material is logged.

## Data Flow

- Crawl images: download and validate/clean locally, then persist through the storage boundary.
- Source video: download locally, extract/review frames and optionally transcribe, then upload the source video and selected final frames; remove unselected frames.
- Image providers, ComfyUI, review upload, and Feishu import: validate or transform first, upload the final asset, then return the TOS URL.
- Feishu publish and other local-file consumers: use a shared bounded materializer that returns an existing local file or downloads an HTTP asset to an OS temporary directory with a cleanup callback.
- Model vision consumers may read an HTTP TOS URL through the existing size/type-validated remote path.
- Historical relative URLs continue through the existing local media route. No database row rewrite is performed.

## Configuration And Interfaces

Advanced config owns `TOS_ENABLED`, `TOS_ACCESS_KEY_ID`, `TOS_ACCESS_KEY_SECRET`, `TOS_BUCKET`, `TOS_ENDPOINT`, `TOS_REGION`, `TOS_PUBLIC_BASE_URL`, and `TOS_OBJECT_PREFIX`. Secrets are write-only in UI snapshots. Public config reports only configured/enabled status.

An admin-only probe route creates isolated image/video probe objects, verifies HEAD, anonymous GET and Range, and removes them in `finally`. Normal baseline checks mock the SDK and never call a live provider.

## Compatibility And Rollback

TOS-backed records use ordinary absolute HTTPS URL strings already supported by the domain types. Cache status recognizes only the configured public base and prefix as managed cache; unrelated provider URLs remain remote sources.

Rollback is configuration-first: set `TOS_ENABLED=false` while retaining the new code so existing TOS videos can still be materialized for Feishu. Do not roll back to an older release after TOS-backed video URLs exist unless those records are restored to local media first.
