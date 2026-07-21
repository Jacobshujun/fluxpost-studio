# Image API SSE streaming

## Goal

Use OpenAI-compatible SSE for server-to-provider image generation while preserving the application's existing JSON-facing APIs and final-image persistence flow.

## Requirements

- Add the standard `stream: true` request parameter to `/images/generations` and `/images/edits` requests.
- Request `text/event-stream` and incrementally decode SSE across arbitrary byte boundaries, CRLF delimiters, multiline `data:` fields, and `[DONE]`.
- Ignore partial-image events and persist only the final completed image.
- Treat non-SSE success responses, malformed/error events, premature EOF, and streams without a final image as provider failures.
- Keep the existing retry, primary/backup failover, concurrency, browser API, and final JSON result contracts.
- Cover the full response stream with the configured image request deadline and cancel stalled streams.
- Do not call a live image provider in automated verification.

## Acceptance Criteria

- [x] JSON generation requests and multipart edit requests send `stream: true` and `Accept: text/event-stream`.
- [x] A deterministic local test proves chunk-safe SSE parsing and final-image selection.
- [x] Partial images are not returned or persisted.
- [x] Protocol errors and response-body timeouts reject through the existing retry/failover path.
- [x] `/api/images`, `/api/generate`, and internal image generation return shapes remain unchanged.
- [x] Focused checks, TypeScript, lint, build, and the Trellis baseline pass without external provider calls.

## Notes

- `OPENAI_IMAGE_ENDPOINT=responses` is outside this change.
- No `partial_images` parameter or new environment variable is added.
- Verification passed on 2026-07-21. No live image-provider call was made.
