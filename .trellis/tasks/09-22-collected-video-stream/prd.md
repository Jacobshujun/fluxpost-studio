# Collected video stream validation

## Requirements
- Fix source-link collection selecting split/audio-only media as a complete video.
- Retain quality ordering among usable complete-video candidates.
- Reject audio-only files before caching success or durable persistence; re-import must replace invalid cached media.
- Preserve silent videos and existing image-only refresh behavior.

## Acceptance
- Offline fixtures cover DASH/split tracks, audio metadata, duplicate fallback URLs, real audio-only MP4 rejection and valid video acceptance.
- Focused checks and the deterministic baseline pass, or unchanged blockers are documented.
- No paid API calls, publishing reruns or runtime database changes in verification.
