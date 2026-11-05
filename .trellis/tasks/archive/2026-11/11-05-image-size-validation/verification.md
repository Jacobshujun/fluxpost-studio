# Verification — 2026-11-05

## Changes

- JSON Images generation and multipart editing reuse `image-size-options.ts`
  validation/normalization: `auto` or integer edges 64–8192. Removed the four
  fixed-size allow-list. Valid pixel values are sent unchanged after canonical
  formatting; invalid values throw non-retryable input errors.
- Removed legacy ToAPIs 4K ratio whitelist. Legacy fields/count/quality/output
  format/references, ordinary ratio format and Official pixels format retain
  their prior contracts. No node migration, new channel or configuration edit.
- Existing output-size/persistence gates and upstream-error behavior remain.

## Regression evidence

Before source changes, updated regression tests reproduced the old local
JSON-size and legacy-4K rejections. After source changes:

- `image_provider_profiles_check.mjs`: valid arbitrary pixel sizes, normalized
  multiplication-sign input, inclusive 64/8192 boundaries and invalid inputs.
- `image_exact_pixels_check.mjs`: actual JSON and multipart bodies carry
  1536x2048 and the existing 2:3/4K mapping for primary/backup; model and
  binary image preserved, no stream/response_format/input_fidelity added.
- `toapis_image_api_check.mjs`: all listed legacy 4K ratios preserve the exact
  historical body, including multi-output, JPEG settings and references;
  malformed ratios/unknown tiers still fail.
- `canvas_image_models_check.mjs`: actual legacy 2:3/4K submission reaches
  provider once with/without references; ratio/pixels routing, upstream size
  refusal, no retry/failover and secret redaction regressions pass.
- Existing exact-output-size mismatch/no-resize/persistence checks pass.

Full baseline passed with `TRELLIS_SMOKE_PORT=45678`:

```powershell
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

Includes all deterministic checks, ESLint (0 errors / 16 existing warnings),
TypeScript, Next production build, built config API/worker synchronization,
isolated HTTP smoke and SQLite store checks. Baseline log is local ignored
`data/gpt-image-probe/implementation-baseline.log`. Test fixtures were updated
to load the newly shared validator; the built-config isolated dependency
adapter initially rejected that import, then passed after explicitly loading
the pure validator factory. No rule/check was weakened.

## Runtime and limits

No paid provider, Feishu or production call was made for implementation.
Earlier explicitly authorized live 3:4/2K evidence is in
`.trellis/spec/fluxpost/archive/gpt-image-provider-probe-2026-11-05.md`.
Provider 2:3/4K acceptance is still untested; removing local rejection does not
guarantee provider support. Existing pixel mapper remains unchanged.

Read-only loopback runtime/queue preflight found queued/running image and
Canvas work. Therefore port 3001 was deliberately not replaced. It still
reports candidate `a3cd4cebaefb2358fb0626fcce79bd971ed884cc`. After that work
finishes, `npm run local:lan` from the clean primary worktree builds/activates
the committed fix with its own identity/HTTP checks. No linked worktree,
alternative application port or dirty-tree bypass was used.

The runtime currently reports primary `openai_json`, backup `toapis_async`,
and default `gpt-image-2.5-sunburst-official`. Those settings were not changed.
Earlier successful live model tests used `gpt-image-2.5-sunburst`, not the
Official suffix; explicit node selection is needed to reproduce that probe.

## Authorized LAN activation follow-up

After the deferred activation was explained, the operator explicitly requested
"提交，更新到lan" on 2026-11-05. The implementation is already committed as
`67f17bc`; subsequent archive/journal commits contain that repair. Use the
canonical `npm run local:lan` from the clean primary worktree to activate
current HEAD at 0.0.0.0:3001. The command builds the inactive candidate slot,
verifies release identity/HTTP behavior, and restores the previous candidate
if activation fails. The ignored `.fluxpost-local-candidate.json` receipt and
live `/api/version` identify the final activated full SHA. This authorization
supersedes the earlier decision to defer activation due to active tasks.
