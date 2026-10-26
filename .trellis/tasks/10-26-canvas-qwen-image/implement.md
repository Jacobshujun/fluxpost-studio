# Implementation Plan

## Gates

- [x] Task creation approved; endpoint/key entry must be in-node.
- [x] Inspected GPT registration/execution and existing graph secret stripping.
- [x] Drafted requirements, design and plan.
- [x] User requests implementation with I2I; activate task.
- [x] User tutorial supplies synchronous response contract, regional hosts and I2I limits.

## Ordered Work

1. Load targeted frontend, cross-layer, ownership and persistence guidelines. Inspect migration and trusted executor identity conventions; preserve OSS changes.
2. Add failing provider/credential tests. Implement isolated encrypted SQLite/PostgreSQL credential storage, safe key initialization and authenticated routes.
3. Verify reload, replace/remove, endpoint binding, ownership and graph/history/export secrecy.
4. Implement native Qwen request/response and validated media persistence, with cancellation and no fallback/retry.
5. Register node and in-node controls. Integrate normal, iteration and V2 execution; test copies/imports and frozen endpoints.
6. Run focused regression, mocked desktop/mobile browser and full baseline checks. Report unchanged blockers separately.
7. Record evidence and lightweight status/feature state. Do not claim live acceptance or activate/deploy.

## Existing Verification Commands

```powershell
node .trellis/verification/canvas_workflows_check.mjs
node .trellis/verification/canvas_image_models_check.mjs
npm run lint
npx --no-install tsc --noEmit
npm run build
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

Create new provider/credential/browser tests before recording their commands. Use isolated stores and intercepted requests. Browser checks cover 1440px/390px and existing themes without replacing port 3001.

## Execution Status

Implementation and isolated verification are complete; see `verification.md` for commands, evidence and the existing full-lint blocker. No activation or live paid acceptance. Source preserves pending OSS work. Candidate delivery requires a clean verified commit and remains separate.

## Review And Rollback

Review exact request/response contracts, ownership at credential write/use, endpoint binding, redirects, download auth separation, clipboard/history/export secrecy, cancellation and storage failures. Preserve GPT and OSS behavior. Roll back only task-owned code when approved; never automatically delete runtime keys/data.
