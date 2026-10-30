# Implementation Plan

## Gate

- [x] User approved task creation and planning.
- [x] Confirmed root cause and reviewed registry, nested graph, normalization and shared-output boundaries.
- [x] Converged requirements, design and acceptance mapping.
- [x] User approves implementation after plan review.
- [x] Load `trellis-before-dev`, targeted frontend guidelines and current phase detail; activate this task with `task.py start`.

## Ordered Work

1. Add regression fixtures to existing scheduler checks for missing inner binding support; establish the expected failing behavior before the fix.
2. Add the optional binding identity and shared registry helpers; preserve the existing injectable-field allow-list.
3. Update normalization, validation, duplicate detection and immutable injection. Trace main/shared/child/aggregate call order before changing invalid-target handling.
4. Update UI option labels, default selection, type switching and serialization using complete binding identities.
5. Extend scheduler and iteration checks for real normalization/save/preflight paths, same-ID isolation, immutable per-child snapshots, invalid targets/fields, outer compatibility and shared dependency guards.
6. Extend the existing iteration browser fixture for batch parameter selection/save/reload at desktop/mobile sizes using intercepted APIs; verify no new layout overflow. Do not use live model calls or user schedules.
7. Run focused checks and baseline, record actual results and unchanged blockers, then perform final diff review. Update lightweight status and stable binding documentation only after implementation evidence exists.

## Existing Verification Commands

```powershell
node .trellis/verification/canvas_scheduler_check.mjs
node .trellis/verification/canvas_iteration_contract_check.mjs
node .trellis/verification/canvas_iteration_runtime_check.mjs
node .trellis/verification/canvas_iteration_runs_check.mjs
node .trellis/verification/canvas_iteration_actions_check.mjs
node .trellis/verification/canvas_iteration_queue_check.mjs
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

Browser verification uses `python .trellis/verification/canvas_iteration_browser_check.py` with `BROWSER_BASE_URL` pointing to the documented isolated worker-disabled smoke server, never the live 3001 candidate. Read the smoke setup before launching; do not create a second application candidate. If baseline encounters the documented unrelated lint blocker, record it unchanged and run remaining documented lint/types/build/smoke gates explicitly.

## Review Focus

Progress: steps 1-7 complete; scheduler and all five iteration checks pass.
The initial regression failed with `Inner prompt: bound node field is not batch-injectable.` before the fix.
Desktop/mobile browser, types/build/config synchronization/HTTP/SQLite passed. Full baseline domain checks passed before the known 17 unrelated data-script lint errors. Authorized commit and LAN activation passed; see verification.md. Finish archive/journal, then align the LAN candidate to final clean HEAD.

- Validate full identity survives UI -> API normalization -> persisted schedule -> frozen graph -> iteration item.
- Confirm child parameters cannot bypass either UI or server shared-output guards.
- Confirm no hidden credentials or unsupported config become batch-editable.
- Confirm existing outer-only and iteration repair/refresh workflows are unchanged.
- Keep all planning/evidence inside this Trellis task; no new parallel planning system.

## Rollback

Keep implementation scoped to the listed source files and verification fixtures. Revert only this task's changes if required; do not reset unrelated work or mutate runtime schedules. Do not commit, activate or deploy without the applicable user approval.

## Approved Commit

`fix(canvas): support iteration inner-node batch parameters`

- `src/app/canvas/page.tsx`
- `src/lib/canvas/types.ts`
- `src/lib/canvas/registry.ts`
- `src/lib/canvas/scheduler.ts`
- `src/lib/canvas/scheduler-v2.ts`
- `.trellis/verification/canvas_scheduler_check.mjs`
- `.trellis/verification/canvas_iteration_runtime_check.mjs`
- `.trellis/verification/canvas_iteration_browser_check.py`
- `.trellis/spec/fluxpost/architecture_rules.md`
- `.trellis/spec/fluxpost/status.md`
- This task's `task.json`, `prd.md`, `design.md`, `implement.md`, `verification.md` and generated `implement.jsonl`/`check.jsonl` (inline workflow did not dispatch agents).

User approved commit and LAN activation, and removal of the unrelated diagnostic status entry, on 2026-10-30. Exclude runtime data, generated files, local logs and browser screenshots. Follow the existing archive/journal lifecycle; no remote push. Preserve the existing LAN binding and clean-tree guard.
