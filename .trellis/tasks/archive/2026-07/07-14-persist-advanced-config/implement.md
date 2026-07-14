# Implementation Plan

1. Add selected-file resolution and explicit production override loading to `src/lib/config.ts`.
2. Make production override writes retain empty tombstones while preserving the existing local `.env.local` clear behavior.
3. Mount a named config volume and set `FLUXPOST_CONFIG_FILE` for the app service in `compose.yaml`.
4. Update advanced-config static verification with persistence, precedence, and tombstone assertions.
5. Update the Ubuntu Docker deployment documentation and stable Trellis deployment/config facts.
6. Run the focused config check, TypeScript, lint, build, and full Trellis baseline.

## Risk Points

- Persisted overrides must load before `appConfig` initialization.
- Empty override values must clear, rather than merely fail to replace, base Compose variables.
- Tests and diagnostics must never print real configuration values.
- No deploy command or container restart is part of local verification.

## Validation Commands

```powershell
node .trellis/verification/advanced_config_check.mjs
npx --no-install tsc --noEmit
npm run lint
npm run build
$env:TRELLIS_SMOKE_PORT='45678'; powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```
