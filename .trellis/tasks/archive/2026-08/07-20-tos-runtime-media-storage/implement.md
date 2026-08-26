# Implementation Plan

1. Add a failing deterministic TOS storage verification covering configuration, key/URL mapping, fake SDK upload/HEAD/retry behavior, pending retention, cleanup, reuse, overwrite, producer wiring, and secret masking.
2. Add `@volcengine/tos-sdk@2.9.1`, TOS configuration/status fields, and the shared storage plus temporary materialization helpers.
3. Route crawl images/videos/selected frames, generated images, ComfyUI output, review uploads, and Feishu-imported final media through the storage boundary.
4. Update model/image/video/Feishu consumers and media-cache status so TOS URLs remain usable and display as durable cached media.
5. Add the admin-only live probe and configuration-page controls without exposing credentials.
6. Add pending reconciliation, execution-log diagnostics, and deterministic baseline registration.
7. Run focused checks, lint, TypeScript, build, full Trellis baseline, and `npm run local:restart`; inspect the UI and local media compatibility.
8. Update Trellis status, feature state, decisions, architecture, pitfalls, and verification only with confirmed facts; preserve existing dirty changes.
9. Commit only task-related hunks, push the GitHub deployment branch, deploy only `82.158.226.10` with TOS initially disabled, securely persist values from `TOS.txt`, run the live probe, then enable TOS and verify service health.

## Rollback Points

- Before enabling: code is deployed but local media behavior is unchanged.
- After enabling: disable `TOS_ENABLED` and restart only the FluxPost app; do not delete TOS objects or named volumes.
- Never use `docker compose down -v`, start FluxPost Caddy on the Nginx host, or restart unrelated services.
