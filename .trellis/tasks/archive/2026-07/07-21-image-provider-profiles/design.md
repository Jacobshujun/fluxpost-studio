# Technical Design

## Provider Boundary

Keep `generateImagesFromPrompt(...)` and its callers stable. Add an `image-providers` boundary with:

- `ImageProviderProfile`: `openai_json | openai_sse | toapis_async`.
- A resolved route config containing route name, base URL, API key, model, and profile.
- A canonical single-image request containing prompt, requested size/quality, prepared references, and deadline.
- A normalized result containing base64 and/or URL outputs.
- A structured provider error containing category, retry/failover flags, task-acceptance state, sanitized message, and optional task id.

The orchestration layer prepares references once, selects the active route, calls the matching adapter, applies route failover rules, materializes normalized results, and performs existing runtime-media persistence.

## Profiles

- `openai_json`: non-stream JSON `/images/generations`; multipart `/images/edits` for references; minimal official request fields; JSON output parsing. Reject unsupported official sizes before submission rather than guessing.
- `openai_sse`: preserve the deployed relay request body, multipart field behavior, SSE completion parsing, retry behavior, and supported custom-size passthrough.
- `toapis_async`: preserve exact size mapping, URL/upload references, async submission/status polling, `Retry-After`, and immediate result materialization.

Once ToAPIs returns a task id, later polling/terminal failures are marked task-accepted and cannot fail over or resubmit. Content-safety and invalid-image errors are also hard failures. Route auth/network/gateway/capability errors before acceptance may fail over.

## Configuration Compatibility

- `OPENAI_IMAGE_API_PROFILE` owns the primary route when set.
- `OPENAI_IMAGE_BACKUP_API_PROFILE` owns the backup route when set.
- `OPENAI_IMAGE_BACKUP_MODEL` falls back to `OPENAI_IMAGE_MODEL`.
- If a new profile is absent, map legacy `OPENAI_IMAGE_API_DIALECT`: `openai -> openai_sse`, `toapis -> toapis_async`, and `auto`/unset uses the current per-route hostname rule (`toapis.com -> toapis_async`, otherwise `openai_sse`).
- Keep the legacy field readable and accepted so rollback releases retain their current behavior.

## Admin Probe

`POST /api/config/image-provider-check` accepts only `{ route: "primary" | "backup" }`, requires an administrator, and uses fixed non-sensitive prompts plus a small repository PNG fixture. It calls the selected route directly, not failover, so the result identifies that route's capability.

The probe performs text then reference generation, validates decoded/downloaded bytes with the existing image sniffer, stages output only under health/temp paths, and removes all probe artifacts. Its response contains route/profile/model and per-mode `{ ok, durationMs, outputVerified, cleanupVerified, error? }`. Provider bodies, keys, prompts, task ids, and output URLs are omitted.

The Advanced Configuration page exposes one compact test control for each configured route. Dirty provider fields disable the control. Clicking requires confirmation that two paid generations will run; saving never invokes the probe.

## Rollout And Rollback

No data migration is needed. The new config fields are additive, while legacy dialect values remain in the persistent config volume. Deploy through GitHub `main` to `82.158.226.10`; rollback switches the release symlink to the previous release, whose code ignores new fields and continues reading the unchanged legacy dialect.
