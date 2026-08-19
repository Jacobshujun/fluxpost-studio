# Implementation Plan

1. Add `SEEDANCE_PROMPT_SKILL_PATH` to app configuration, Seedance advanced config definitions, and deployment environment example.
2. Extract the current variable creative rules into a built-in fallback and implement the server-only loader with bounded read, metadata hash, cache, and change detection.
3. Inject loaded Skill text into `buildSeedanceAssistantModelPrompt()` while keeping fixed output/safety rules after the Skill section; return metadata from candidate generation.
4. Extend the API response type and Canvas assistant result UI with source/version metadata and visible loader errors.
5. Add focused deterministic checks for cache refresh, failure behavior, prompt injection resistance, and API/UI wiring.
6. Run focused check, lint, TypeScript, build, and the complete Trellis baseline; update project status/spec evidence and commit.

## Validation

```powershell
node .trellis/verification/seedance_runtime_skill_check.mjs
npm run lint
npx --no-install tsc --noEmit
npm run build
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```
