# Design

## Boundary

Only the OpenAI-compatible Images API transport changes. Application routes and callers continue to await a final `ImagesApiResponse`-shaped value.

## Request And Response Flow

1. Add `stream: true` to generation JSON and edit multipart bodies, with `Accept: text/event-stream` on both.
2. Keep a single AbortController active from `fetch` through complete body consumption.
3. Feed decoded chunks into a stateful SSE decoder. Dispatch events on blank lines, join multiline data with newlines, ignore comments, and stop at `[DONE]`.
4. Ignore `image_generation.partial_image`. Accept `image_generation.completed` only when it contains final `b64_json` or `url` data, then adapt that data to the existing `ImagesApiResponse` shape.
5. Reject SSE error events, invalid JSON, missing bodies, non-SSE content types, EOF without `[DONE]`, or completion without a final image. Existing retry/failover handles the rejection.

## Observability

Record transport, parsed event count, partial event count, completion count, and completion status. Never log event payloads or base64 data.

## Compatibility

Both primary and backup Images API routes must implement OpenAI-compatible SSE. A 2xx JSON response is a protocol failure. Multi-image generation remains repeated `n: 1` requests.
