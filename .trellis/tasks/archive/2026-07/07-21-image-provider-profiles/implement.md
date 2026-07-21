# Implementation Plan

1. Add a failing deterministic provider-profile contract check covering profile normalization, legacy mapping, route-specific model/profile resolution, request bodies, response parsing, structured errors, probe authorization/wiring, and UI confirmation behavior.
2. Add shared provider types, profile normalization, route config resolution, output parsing, and structured errors under `src/lib/image-providers/`.
3. Move OpenAI JSON, OpenAI SSE, and ToAPIs wire behavior behind adapters while keeping image-generation callers and persistence stable.
4. Add primary/backup profile and backup-model configuration, status types, allow-listed advanced fields, and backward-compatible legacy resolution.
5. Add a fixed reference fixture, sanitized provider probe service, admin-only API route, and Advanced Configuration controls.
6. Run the new check until green, then existing focused image/config checks, TypeScript, lint, build, full baseline on port 45678, and `npm run local:restart`.
7. Load `trellis-check`, review/fix the full diff, update stable FluxPost specs/status/evidence, and rerun affected checks.
8. Stage only task-owned hunks, commit, push `main`, run the 82 VPS deploy preflight and deployment, and verify application/dependency service health without touching the 104 VPS.
9. Leave paid production probes as an explicit authenticated administrator action; document whether the operator completed them.

## Rollback Points

- Before adapter integration: remove only new test/provider files.
- Before deployment: profile fields are additive and unset, so the deployed behavior remains legacy-compatible.
- After deployment: switch the 82 VPS `current` symlink to the previous release and restart only FluxPost app/PostgreSQL through the documented Compose project.

## Verification Commands

```powershell
node .trellis/verification/image_provider_profiles_check.mjs
node .trellis/verification/toapis_image_api_check.mjs
node .trellis/verification/openai_image_sse_check.mjs
node .trellis/verification/image_task_fallback_check.mjs
node .trellis/verification/gpt_image_size_request_check.mjs
node .trellis/verification/viral_replication_regression_check.mjs
node .trellis/verification/advanced_config_check.mjs
npx --no-install tsc --noEmit
npm run lint
npm run build
$env:TRELLIS_SMOKE_PORT=45678; powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
npm run local:restart
```
