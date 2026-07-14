# Design: Persist advanced config across Docker deployments

## Architecture

Use two configuration layers:

1. `deploy/env.production` remains the operator-managed base environment consumed by Docker Compose.
2. The advanced-config UI writes an allow-listed override file selected by `FLUXPOST_CONFIG_FILE`.

Production sets `FLUXPOST_CONFIG_FILE=/app/config/.env.local` and mounts a named volume at `/app/config`. Local development leaves the variable unset and retains the current `process.cwd()/.env.local` behavior.

## Runtime Contract

When `src/lib/config.ts` is first loaded and `FLUXPOST_CONFIG_FILE` is set, it reads the override file before constructing `appConfig`. Non-empty persisted values replace the corresponding base `process.env` value. Empty assignments are tombstones and remove the corresponding base value, allowing an explicit UI clear to survive restarts.

Saving continues to normalize and allow-list values, writes the selected file, updates `process.env`, and reloads `appConfig` immediately. Secret values remain absent from API snapshots and logs.

## Compatibility

- Local `.env.local` behavior remains the default and continues removing cleared keys from that file.
- Existing production `env.production` values remain effective until an admin saves an override for the same key.
- No automatic secret migration is required: current UI-managed values were stored only in an already-replaced container and are unavailable to the repository.

## Trade-offs

A named override volume avoids changing host-file ownership and avoids giving the container write access to `/opt/fluxpost-studio/shared/env.production`. It also keeps deployment-owned base settings separate from admin UI overrides. Operators must clear an override through the UI before a changed base value for the same key can take effect.

## Rollback

Reverting the Compose mount and `FLUXPOST_CONFIG_FILE` restores the previous behavior. The named volume can remain unused; it must not be deleted automatically because it contains secrets.
