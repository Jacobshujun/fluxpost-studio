# Technical Design

## Provider Boundary

Keep `generateImagesFromPrompt(...)` and all callers unchanged. Extend the image-provider boundary with a route-aware dialect resolver:

- `openai`: current synchronous JSON `/images/generations` and multipart `/images/edits` behavior.
- `toapis`: documented asynchronous JSON `/images/generations` behavior for both text and reference inputs.
- `auto`: resolve `toapis` for `toapis.com` route hosts and `openai` otherwise.

Primary and backup routes resolve their dialect independently so mixed-provider failover remains possible.

## ToAPIs Data Flow

1. Convert the requested FluxPost pixel preset to the exact documented `size` ratio and `resolution` tier.
2. Keep public HTTP references as URLs. Normalize and upload local-only files to `/uploads/images`; never submit base64 to the generation endpoint.
3. Submit one JSON task with `model`, `prompt`, `n: 1`, `size`, `resolution`, `response_format: "url"`, and optional `reference_images`.
4. Require a task id, wait five seconds, then query `/images/generations/{id}` every five seconds with bounded jitter. Respect `Retry-After` for `429`/`503` and the existing overall timeout.
5. On `completed`, validate `result.data[].url`; on `failed`, surface the provider error; on timeout, fail explicitly.
6. Download each temporary result immediately and pass it through the existing generated-image persistence path, which writes a verified TOS URL when enabled.

## Compatibility And Failure Semantics

Do not change the public generation result type. Existing OpenAI relay behavior and response parsing stay intact. ToAPIs task envelopes are decoded only inside the provider boundary.

`model_not_found` and `no available channel` are configuration/provider capability failures, even when transported as HTTP 503. They must bypass ordinary transient source-image fallback so a generated post cannot claim success with copied source pixels.

## Rollout And Rollback

Add `OPENAI_IMAGE_API_DIALECT` to advanced configuration. Production may use `auto` because the configured route is `toapis.com`; setting `openai` restores the old request shape without reverting code. A failed rollout is rolled back by redeploying the previous release symlink or setting the dialect explicitly, without touching data volumes or TOS objects.
