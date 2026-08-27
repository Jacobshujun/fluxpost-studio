# Technical Design

## Boundaries

Keep directory scanning/snapshot persistence in a dedicated canvas domain module and authenticated API routes. Reuse existing canvas registry/types/executor conventions, runtime-media materialization, local-video concurrency, and content assembly contracts. Do not alter GeneratedPost schema.

## Data Flow

1. User scans an absolute path. Server checks feature flag and session, groups supported media, validates headers, hashes files, and persists an owner-scoped immutable snapshot plus group/media rows.
2. Canvas node stores only snapshot references while editing. Execution loads the snapshot, revalidates path accessibility, size/mtime/hash and media type, then emits typed image/audio/video artifacts.
3. Slideshow executor receives ordered image refs and one audio ref, creates deterministic blurred/contained frames and transparent `sharp` text layers, invokes FFmpeg through existing helpers, materializes the MP4, and returns a `videos` artifact.
4. V2 adapter expands each valid directory group into an independent child task. Existing compose node consumes images and videos to create review drafts.

## Persistence and Security

Use a migration with owner id, normalized path, relative path, byte size, mtime, media info, SHA-256, and snapshot/group relationships. Every read/preview route requires the current session and owner match. Preview supports Range for audio/video. Export/import serializers redact path, snapshot id, media inventory, and selected audio.

## Compatibility

Extend artifact/port unions with `audios` and audio media references; preserve unknown/legacy nodes during load. Existing `compose.social-post` remains the aggregation boundary and still receives image/video URLs.

## Rollout

Ship behind environment gating for production. Verify offline with fixtures and isolated temp directories. Activate port 3001 only after a clean commit and baseline verification.
