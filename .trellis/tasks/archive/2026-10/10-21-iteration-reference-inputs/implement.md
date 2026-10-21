# Implementation Plan

Status: implementation and verification complete; commit authorized. Archive scoped implementation; activation awaits resolution of unrelated untracked Gemini task records. See verification.md.

## Affected Files

- src/lib/canvas/registry.ts: port definitions, visibility and shared ordering.
- src/lib/canvas/iteration-runtime.ts: child reference ordering.
- src/app/canvas/page.tsx: compact ordering guidance.
- .trellis/verification/canvas_iteration_contract_check.mjs: visibility, validation and persistence round trips.
- .trellis/verification/canvas_iteration_runtime_check.mjs: child ordering regressions.
- Task verification evidence and status.md after implementation changes current state.

## Steps

1. Review artifacts with the user, then activate the task.
2. Extend deterministic checks to demonstrate missing behavior.
3. Implement numbered ports, ordered child inputs and guidance.
4. Run focused checks and isolated browser verification; do not replace port 3001.
5. Run baseline, report existing blockers without weakening checks, and record evidence.
6. Report source completion separately from activation. Commit and activation require later explicit authorization.

## Commands

```powershell
node .trellis/verification/canvas_iteration_contract_check.mjs
node .trellis/verification/canvas_iteration_runtime_check.mjs
node .trellis/verification/canvas_iteration_runs_check.mjs
npx --no-install eslint src/lib/canvas/registry.ts src/lib/canvas/iteration-runtime.ts src/app/canvas/page.tsx
npx --no-install tsc --noEmit
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

Browser checks must follow existing worker-disabled isolated-server and intercepted-API conventions. Determine the applicable harness before recording its invocation. No live generation or real workflow writes.

## Cases

- Empty, sequential, sparse and maximum ports; highest-port removal; legacy visibility; unchanged GPT behavior.
- Duplicate incoming numbered edges rejected, legacy multiple edges retained.
- Reversed connection/field order, multi-image artifacts, duplicate URLs, mixed legacy/numbered and no references.
- Each child receives the same references and retains its own source image/index.
- Serialization, clipboard and workflow-file round trips preserve connections.
- Dynamic handles and guidance are readable in supported themes and narrow layouts.
