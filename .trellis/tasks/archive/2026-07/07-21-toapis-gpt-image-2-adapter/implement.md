# Implementation Plan

1. Add a failing deterministic ToAPIs contract check for dialect resolution, exact size mapping, JSON generation/reference payloads, upload/status endpoints, async terminal parsing, retry timing, temporary-result materialization, and hard model-channel errors.
2. Add the allow-listed advanced dialect configuration and route-aware resolver.
3. Refactor the image request boundary so standard OpenAI and ToAPIs requests share retry/failover orchestration but own their distinct wire contracts.
4. Implement URL-only reference preparation, official local-image upload, asynchronous polling, and provider error decoding.
5. Preserve generated output download and `persistRuntimeMedia` handling; keep existing callers unchanged.
6. Run focused checks, `npx --no-install tsc --noEmit`, `npm run lint`, `npm run build`, the full Trellis baseline, and `npm run local:restart`.
7. Update stable Trellis provider-contract facts, commit only task-related changes, push `main`, and deploy only `82.158.226.10` through the existing deployment entry point.
8. Run explicit paid text/reference image probes, verify generated TOS URLs differ from source URLs, and confirm FluxPost plus unrelated VPS services remain healthy.

## Risk And Rollback Points

- Do not infer unsupported custom pixel sizes; fail before a paid request.
- Do not poll faster than the documented five-second minimum.
- Do not log provider keys, signed details, prompts, or full user media URLs.
- Do not remove or recreate named volumes, start FluxPost Caddy, or modify existing Nginx sites.
- Before live probes, confirm the deployed dialect/base URL/model through non-secret configuration only.
