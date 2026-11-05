# Provider image-size validation

## Request

Remove obsolete application size restrictions after the operator verified
the supplied provider accepts GPT-Image-2.5 Sunburst 1536x2048 generation and
reference editing. Keep existing ToAPIs nodes compatible.

## Requirements

- Non-stream OpenAI-compatible requests accept `auto` or the application's
  existing valid pixel range (integer width/height 64–8192), including 3:4/2K
  and the existing 2:3/4K pixel mapping. Do not silently substitute a size.
- Old ToAPIs legacy requests can submit any existing listed ratio at 4K.
- Preserve ToAPIs legacy/ratio/pixels request fields, defaults, references,
  asynchronous task lifecycle, model overrides and explicit upstream errors.
- Retain malformed/out-of-range input checks, output-size verification and
  no-resize/no-downgrade behavior. Do not claim untested provider support.
- Do not add channels, UI controls, provider-specific branches or paid tests.

## Acceptance

- Regression checks verify actual JSON and multipart requests carry 1536x2048
  and 2:3/4K pixels; invalid sizes fail locally before transport.
- ToAPIs legacy 2:3/4K reaches the provider with ratio/tier and historical
  fields unchanged. Ordinary ratio and Official pixels regressions pass.
- Unsupported-size upstream errors remain non-retryable without failover or
  silent source fallback; exact-output mismatch remains a hard error.
- Focused checks, full baseline and production build pass. Local activation
  follows the project's clean committed candidate guard; no remote deployment.

## Scope and verification

Source: `image-providers/contracts.ts`, `toapis-image-api.ts`, shared existing
`image-size-options.ts` validator. Update existing VM-based test dependency
fixtures for the shared import; no new test framework. Update affected stable
contracts and status, retain the earlier sanitized live-probe evidence.

Commands: existing image provider profiles, exact pixels, ToAPIs adapter,
Canvas image models checks; full `.trellis/verification/check.ps1` with smoke
port 45678, `npm run build`, and local candidate HTTP/version verification
if activated. No live image calls are required by this change.
