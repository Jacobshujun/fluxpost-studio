# ToAPIs GPT-Image-2 protocol adapter

## Goal

Restore real GPT-Image-2 generation after the image relay changed to ToAPIs, while preserving the existing OpenAI-compatible image path for other relays.

## Confirmed Facts

- The production image base URLs on `82.158.226.10` point to `https://toapis.com/v1` and the configured model is `gpt-image-2`.
- ToAPIs documents `POST /v1/images/generations` as an asynchronous JSON API for both text-to-image and reference-image generation.
- ToAPIs accepts `size` as an aspect ratio, `resolution` as `1k|2k|4k`, URL-only `reference_images`, and returns a task id that must be queried through `GET /v1/images/generations/{task_id}`.
- Completed result URLs expire after 24 hours, so FluxPost must download and persist them through its existing runtime-media boundary before returning generated posts.
- The deployed route can return undocumented non-terminal `pending`; FluxPost must continue polling it like `queued`/`in_progress`.
- Existing code sends pixel dimensions and OpenAI-specific fields; reference-image work uses multipart `POST /images/edits`. A ToAPIs `503 model_not_found` is currently classified as recoverable and silently replaced with the source image.

## Requirements

- Add an explicit image API dialect setting with `auto`, `openai`, and `toapis`; `auto` must recognize the documented ToAPIs hostname without changing other relays.
- Keep the current OpenAI/Packy JSON generations and multipart edits behavior unchanged when the dialect is `openai`.
- For ToAPIs, submit text and reference-image jobs as JSON to `/images/generations` using documented `size`, `resolution`, `n: 1`, `response_format: url`, and `reference_images` fields.
- Map every supported FluxPost pixel preset to an exact documented ToAPIs ratio/resolution pair. Reject unsupported custom sizes explicitly instead of guessing.
- Pass public HTTP/TOS references directly. Upload local-only reference files through the documented `/uploads/images` endpoint and validate its success envelope and URL.
- Poll the documented task-status endpoint at provider-safe intervals, respect `Retry-After` on `429`/`503`, stop at the existing image request deadline, and surface terminal provider errors.
- Download completed temporary result URLs and persist them through `persistRuntimeMedia` before returning post media.
- Treat `model_not_found` and `no available channel` as hard configuration/provider failures; do not mark a source-image fallback as a completed generated image.
- Expose the dialect through advanced configuration without exposing credentials.
- Deploy only to `82.158.226.10`; preserve PostgreSQL, TOS/config/runtime volumes, Nginx, Open WebUI, and unrelated services.

## Acceptance Criteria

- [x] Deterministic verification proves ToAPIs request path, JSON fields, preset mapping, URL references, local upload boundary, asynchronous result parsing, polling cadence, and hard model-channel errors without live provider calls.
- [x] Existing OpenAI-compatible request-shape verification continues to pass.
- [x] TypeScript, lint, build, full Trellis baseline, and local production restart pass.
- [x] The deployment runs the new commit on `82.158.226.10` with healthy app/PostgreSQL and unchanged unrelated services.
- [x] One explicit paid text-to-image probe completes through ToAPIs, and its final image is persisted as a TOS URL rather than a temporary ToAPIs URL or source-image fallback.
- [x] One explicit paid reference-image probe uses a public TOS reference and produces a distinct generated TOS object.

## Out Of Scope

- Changing the text model provider.
- Migrating historical generated images.
- Deploying to `104.243.21.233`.
- Adding webhooks or a new durable provider-task database queue in this change.

## Source

- `https://docs.toapis.com/docs/cn/api-reference/images/gpt-image-2/generation`
- `https://docs.toapis.com/docs/cn/api-reference/tasks/image-status`
- `https://docs.toapis.com/docs/cn/api-reference/uploads/images`
- `https://docs.toapis.com/docs/cn/api-reference/rate-limits/async-tasks`
