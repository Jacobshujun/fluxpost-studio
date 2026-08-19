# Implementation

- [x] Add shared assistant contract, prompt policy, response decoder, and deterministic audit.
- [x] Add authenticated thin API route using the existing text/vision provider helpers.
- [x] Add Seedance inspector assistant state, request flow, candidate rendering, and explicit apply behavior.
- [x] Add compact responsive styles and accessible busy/error states.
- [x] Add deterministic verification for contracts, policy routing, malformed responses, audit rules, and source wiring.
- [x] Run focused checks, lint, TypeScript, build, and the full offline baseline.
- [x] Update FluxPost status/feature evidence if the outcome changes feature state.

## Validation Commands

```powershell
node .trellis/verification/seedance_prompt_assistant_check.mjs
npm run lint
npx --no-install tsc --noEmit
npm run build
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

## Risk Points

- Do not trust model-supplied checks or raw `@图片N` text.
- Do not call external providers from verification.
- Do not overwrite a local prompt until the operator clicks apply.
- Preserve current contentEditable mention serialization and upstream prompt exclusivity.
