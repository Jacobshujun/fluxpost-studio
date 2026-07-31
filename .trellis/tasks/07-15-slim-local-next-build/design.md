# Design

## Configuration Boundary

`next.config.ts` will derive standalone mode from an explicit `FLUXPOST_STANDALONE_BUILD=1` build-time environment variable. Default local builds omit `output`, retaining the standard Next.js server output consumed by `next start`.

The Docker builder stage will set `FLUXPOST_STANDALONE_BUILD=1` before `npm run build`, preserving `.next/standalone` for the existing runner-stage copy.

## Trace Boundary

`outputFileTracingExcludes` will apply to all application routes and exclude only runtime-owned paths:

- `public/generated/**/*`
- `public/media/**/*`
- `data/**/*`
- `test-artifacts/**/*`

These files are not application dependencies. Docker excludes them from build context and mounts their production locations as persistent volumes.

## Compatibility

- Local `next dev`, `next start`, and `local:restart` remain unchanged.
- Docker continues to execute standalone `server.js`.
- Static source-controlled assets under `public/` remain available and are not excluded.

## Rollback

Revert the conditional output and Docker build environment declaration, then run a clean build. No runtime-data migration is involved.
