# Implementation Plan

1. Inspect every `canvasImageBatch`, partial-retry, aggregation, and Excel review-note reference; compare the recent retry commit and pre-Excel behavior.
2. Remove review-layer metadata from types, Canvas post composition/sync, scheduler aggregation, review UI, Canvas publish execution, and Feishu queue validation.
3. Remove partial-specific retry predicates and copy while preserving ordinary failure/configuration retry paths.
4. Add the dry-run/apply PostgreSQL + SQLite maintenance command without touching row timestamps or Canvas history.
5. Update focused deterministic checks for scheduling parity, review serialization/UI, Feishu modes, retry behavior, and maintenance behavior.
6. Run focused checks, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`.
7. Update stable Trellis state/decision evidence, commit all scoped changes, and confirm a clean worktree.
8. Inspect active queues/schedules, activate the clean HEAD with `npm run local`, run maintenance dry-run/apply/verification, and browser-check desktop/mobile review controls without publishing.

## Review Gates

- Search proves no production code reads or writes `canvasImageBatch`.
- Search proves no user-facing `重试失败图片`, partial warning, failed-index warning, or Excel-only manual verification note remains。
- Tests demonstrate `failed` retry remains and partial retry is absent.
- Maintenance dry-run is non-mutating; apply changes only the JSON key.

## Validation Commands

- Use the named focused scripts discovered in `.trellis/spec/fluxpost/verification.md` and package scripts; do not call external providers.
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`
