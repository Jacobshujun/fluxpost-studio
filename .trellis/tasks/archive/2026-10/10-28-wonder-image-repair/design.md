# Design

- Extend Wonder v1 additively with optional `referenceUrls` and `image_1` through `image_9`; keep connected legacy `references` visible. Defaults and endpoint credential binding do not change.
- Reuse GPT-style progressive-port visibility and image list UI. Inputs are ordered direct URLs, legacy references, then numbered ports; first occurrence wins, more than nine unique images fails. Do not rewrite saved workflows or run records.
- Add a `wonder-reference` upload mode with JPEG/PNG/WebP, 20MB and 400-8000px bounds. Byte validation happens before storage; reuse validation during execution.
- Request JSON explicitly via `?Format=JSON`; retain canonical root endpoint in config/credential binding. Errors include action/status/safe request ID, sanitized JSON code/message, or a non-JSON format classification without raw bodies.
- `Wonder-` model media registration opts into third-party assets and waits for Normal plus ThirdPartyAssetStatus Success. Plain Qwen requests retain ordinary media readiness.
- Keep durable JobId resume, image pool and cancellation; no automatic paid retry. Persist result bytes in public staging before cleanup so local-storage outputs remain valid too.

Prior runtime evidence only proves HTTP 400 with no JobId. It does not prove which Yike action failed; no stronger historical claim is made.
