# Image provider profiles

## Goal

Make FluxPost image-provider switching predictable by routing a stable internal image-generation contract through explicit, tested provider profiles instead of assuming every relay implements the same wire protocol.

## Background

- The current Images API boundary supports an OpenAI-compatible SSE shape and a ToAPIs asynchronous task shape.
- Primary and backup routes currently share one explicit dialect/model setting, so mixed-provider failover is only partially supported through hostname-based `auto` detection.
- OpenAI's current GPT Image guide documents ordinary JSON generation and multipart edits without requiring streaming. It also states that `gpt-image-2` must omit `input_fidelity`.
- Provider URLs may be temporary and must continue through FluxPost runtime-media persistence for normal production.

## Requirements

- Provide three fixed profiles: `openai_json`, `openai_sse`, and `toapis_async`.
- Resolve primary and backup routes independently, including base URL, API key, model, and profile.
- Keep `OPENAI_IMAGE_API_DIALECT` as a compatibility input. New profile variables take precedence without rewriting existing persisted configuration.
- Keep existing image-generation callers and `GeneratedPost.imageUrls` unchanged.
- Normalize provider outputs into base64 or URL image results and keep normal production persistence unchanged.
- Use structured provider failures so failover is allowed only for route/auth/network/gateway/capability failures. Content safety, invalid input/reference images, and failures after an asynchronous task is accepted must not submit a duplicate task on another route.
- Add an admin-only, explicitly paid image-provider check that runs one text generation and one reference-image generation using a repository fixture. Saving configuration must never trigger it.
- The provider check must verify returned image bytes, clean temporary local/TOS health artifacts, and never return secrets, raw provider bodies, prompts, or image bytes.
- Preserve dense existing Advanced Configuration UI patterns and show clear busy, success, and failure states.
- Default automated verification must remain offline and must not call live image providers.
- Deploy only to `82.158.226.10`; do not access or change `104.243.21.233`.

## Acceptance Criteria

- [ ] Deterministic checks prove all three request/response profiles, independent main/backup resolution, legacy dialect mapping, unsupported-size behavior, structured failover rules, and accepted-task non-resubmission.
- [ ] `openai_json` sends no `stream`, `response_format`, or `input_fidelity`, accepts JSON `data[].b64_json` and `data[].url`, and uses generation/edit endpoints according to reference presence.
- [ ] Existing SSE and ToAPIs regression checks remain green.
- [ ] `GET /api/config` exposes non-secret resolved profile/model status; advanced configuration exposes allow-listed primary/backup profile and backup model fields without revealing keys.
- [ ] `POST /api/config/image-provider-check` is admin-only, validates `route`, runs exactly the two fixed probe modes, and reports sanitized per-mode verification/cleanup results.
- [ ] Config saving remains free of external calls; the UI requires an explicit confirmation before the paid probe.
- [ ] Lint, TypeScript, build, focused checks, the full Trellis baseline, and local production restart pass.
- [ ] Task changes are committed and pushed without including unrelated dirty files.
- [ ] GitHub `main` is deployed only to `82.158.226.10`; app/PostgreSQL, Nginx/public HTTPS, and existing Open WebUI remain healthy, with FluxPost Caddy/proxy still disabled.

## Out Of Scope

- Arbitrary JSONPath/request-template mapping in the admin UI.
- Database schema changes.
- Automatic paid probes on save or in the default baseline.
- Adding support for an undocumented fourth provider protocol.
