# Implementation Plan

1. Add an explicit standalone build-mode switch and runtime tracing exclusions to `next.config.ts`.
2. Enable that switch only in the Docker builder stage.
3. Extend deterministic deployment/build checks to cover local-default and Docker-mode contracts.
4. Run focused checks, type-check, lint, and a clean local build.
5. Confirm `.next/standalone` is absent and measure the resulting `.next` size.
6. Run the full Trellis baseline and refresh the local production server on port 3001.
7. Update stable Trellis status/evidence only with verified results.

## Rollback Points

- Before the clean build: configuration-only rollback.
- After the clean build: revert configuration and rebuild; runtime media and databases are unaffected.

## Verification Commands

- `node .trellis/verification/vps_deployment_check.mjs`
- `npx --no-install tsc --noEmit`
- `npm run lint`
- `npm run build`
- `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` with `TRELLIS_SMOKE_PORT=45678`
- `npm run local:restart`
