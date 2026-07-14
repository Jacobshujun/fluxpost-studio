# Persist advanced config across Docker deployments

## Goal

Keep admin-managed advanced configuration available after the production Docker app container is recreated or redeployed.

## Background

- `PATCH /api/config` currently writes allow-listed values to `process.cwd()/.env.local` and refreshes the current Node process.
- Production deploys recreate `fluxpost-app`; Compose does not persist `/app/.env.local`.
- The production container starts from `deploy/env.production`, so UI-managed values disappear after a container replacement.
- Public `GET /api/config` on 2026-07-14 returned HTTP 200 while TikHub, OpenAI text/image, and Feishu configuration statuses were false, matching the reported loss.

## Requirements

- Preserve advanced configuration changes in a Docker named volume that survives app-container replacement.
- Load persisted advanced configuration overrides before `appConfig` is initialized, with persisted values taking precedence over base Compose environment values.
- Preserve the existing local-development default of writing `process.cwd()/.env.local` when no production override path is configured.
- Preserve secret masking, admin authorization, and the allow-listed patch contract.
- Persist explicit clears so a base environment value does not reappear after restart.
- Do not expose or migrate real secret values through repository files, logs, tests, or Trellis artifacts.
- Document the production persistence behavior and the base-versus-override relationship.

## Acceptance Criteria

- [x] Compose mounts a named configuration volume into the app and points the app at a writable advanced-config file within it.
- [x] A saved non-empty value is available immediately and is reapplied when a fresh Node process starts with the same persisted file.
- [x] A saved clear remains cleared after a fresh process starts even when the base process environment contains the key.
- [x] Local development still defaults to `.env.local` without requiring Docker-specific environment variables.
- [x] Existing admin-only access, allow-listing, masked-secret response behavior, and non-sensitive `GET /api/config` behavior remain verified.
- [x] Type checking, lint, production build, the focused advanced-config check, and the project baseline pass.
