# RunningHub GPT2 Image ComfyUI Node

## Goal

Create and publish a standalone ComfyUI custom node named `GPT2-image-run` that calls RunningHub's official GPT Image 2 image-to-image endpoint using the exact JSON contract supplied by the user.

## Confirmed API Contract

- Endpoint: `POST https://www.runninghub.cn/openapi/v2/rhart-image-g-2-official/image-to-image`.
- Authentication: `Authorization: Bearer <RUNNINGHUB_API_KEY>`.
- Content type: `application/json`.
- Request fields: `prompt`, `imageUrls`, `aspectRatio`, `resolution`, and `quality`.
- Successful response: top-level `status="SUCCESS"`, `taskId`, optional usage fields, and `results[]` objects containing generated image `url` values.
- The supplied source image URL contains temporary signed query parameters and must not be persisted in code, tests, Trellis, logs, or documentation.

## Requirements

- Deliver an independent repository that can be cloned into `ComfyUI/custom_nodes`.
- Register a node with display name `GPT2-image-run` under category `image/api`.
- Expose `prompt`, `image_urls`, `aspect_ratio`, `resolution`, `quality`, `request_url`, `api_key`, `seed`, and `timeout_seconds` controls.
- Accept `image_urls` as either a JSON string array or newline-separated absolute HTTP(S) URLs and send them as `imageUrls`.
- Keep the endpoint configurable while defaulting to the supplied official RunningHub endpoint.
- Read a blank `api_key` from `RUNNINGHUB_API_KEY` and never persist or log the key.
- Send the exact five-field JSON request body and Bearer authorization header.
- Require HTTP success plus response `status="SUCCESS"`; otherwise report a concise sanitized error containing available `taskId`, `errorCode`, `errorMessage`, or failed reason.
- Recognize Cloudflare HTTP 524 as an upstream timeout and avoid dumping an HTML error page into ComfyUI.
- Download every valid `results[].url` without forwarding the Bearer token, validate returned image bytes, and return one ComfyUI `IMAGE` batch.
- Add ComfyUI search aliases for repository name, node name, RunningHub, and Chinese search terms.
- Document installation, image URL requirements, temporary signed URL risks, request/response shape, and troubleshooting.
- Include deterministic mocked tests with no live RunningHub or image-provider calls.
- Push the final implementation to `https://github.com/Jacobshujun/gpt2-image-run` without credentials, signed URLs, local data, or generated media.

## Out Of Scope

- Uploading local ComfyUI `IMAGE` tensors to RunningHub, because no upload API contract was provided.
- Inventing task polling for non-success statuses, because no async status endpoint was provided.
- Supporting OpenAI Images API request bodies in this node.
- Performing a real paid generation during verification.

## Acceptance Criteria

- [x] The plugin package registers `GPT2ImageRun` with display name `GPT2-image-run` and searchable aliases.
- [x] Tests prove URL-list normalization, exact RunningHub request JSON, Bearer auth, successful result downloads, non-success diagnostics, 524 compaction, secret redaction, and ComfyUI output schema.
- [x] The package loads under the local ComfyUI Python runtime and its image decoder returns BHWC float32 output.
- [x] README provides Windows installation and safe API key/image URL guidance.
- [x] Sensitive-value scanning finds no real API key or signed RunningHub URL.
- [x] Remote `main` contains the verified final commit.

## Notes

- The user's request to develop and upload the repository authorizes implementation after this planning contract is written.
- Verified implementation commit: `e23aa62ca8a6d00dce9317b90d292e1ac73a4f02` on `Jacobshujun/gpt2-image-run` `main`.
