# Canvas Common Nodes Implementation

## Ordered Work

- [x] Extend shared node/config contracts, registry definitions, validators, icons, literals, and passive/reuse behavior.
- [x] Add snapshot picker inspector controls for content-pool and library images with explicit refresh and ordered selection.
- [x] Add pure text/image-selection executors and deterministic tests.
- [x] Extract/reuse an OpenAI-compatible multimodal helper and add GPT vision executor plus mocked request coverage.
- [x] Add bounded image transformation and video-frame helpers with runtime-media persistence and deterministic fixtures/mocks.
- [x] Add desktop quick-add search, keyboard/focus guards, compatible-port filtering, ambiguous-port selection, and automatic edge creation.
- [x] Extend canvas browser/check coverage and verify desktop/mobile layouts without live external calls.
- [x] Run focused checks, TypeScript, lint, build, full baseline, local restart, and update Trellis state with verified evidence.

## Verification

```powershell
node .trellis/verification/canvas_workflows_check.mjs
npx --no-install tsc --noEmit
npm run lint
npm run build
$env:TRELLIS_SMOKE_PORT='45678'; powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
npm run local:restart
```

Browser checks use mocked canvas/content/library/run APIs at 1440px desktop and 390px mobile. They must not call paid providers, Seedance, Feishu, or production services.

## Risk Points

- Preserve edge ordering because templates, image selection, and fingerprints depend on it.
- Keep snapshot fields flat so clipboard validation and stored workflow contracts remain compatible.
- Do not let picker or quick-add keyboard handlers intercept native input/textarea/select/contenteditable behavior.
- Treat runtime media and generated files as local state; do not commit them.
