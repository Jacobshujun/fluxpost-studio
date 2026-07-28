# Canvas Batch Content Scheduler V1 Implementation

## Ordered Work

- [x] Add scheduler/prompt-switch types, registry definition, executor, role validation, seeded-output planning, and immutable server binding helpers.
- [x] Add PostgreSQL/SQLite schema and transactional persistence for schedules, batches, content tasks, image tasks, draft revisions, atomic launch, and fair dispatch claims.
- [x] Add scheduler domain orchestration for library resolution, sampling/resampling, launch, pause/resume/cancel, child Canvas runs, aggregation/finalization, retry, and review-draft synchronization.
- [x] Add thin owner-scoped Canvas schedule API routes.
- [x] Build the Canvas scheduler drawer, draft editor, preflight preview, task hierarchy, controls, and responsive states using current UI conventions.
- [x] Add deterministic domain/API/static/browser checks without live provider calls and register them in the Trellis baseline.
- [x] Run focused checks, TypeScript, focused lint, build, full Trellis baseline, `npm run local:restart`, HTTP smoke, and desktop/mobile browser verification. Full baseline reaches lint and stops only on the unrelated user-owned `.tmp-canvas-common-nodes-browser-check.cjs`; all remaining required checks passed separately.
- [x] Update task/status/feature/spec facts only with verified evidence.
- [x] Replace semantic prompt branches with ordinal Switch inputs 1/2/3 while preserving editable-workflow and immutable-run compatibility.
- [x] Add the standard scheduler skeleton insertion command and remove semantic prompt presets from the batch editor.
- [x] Extend deterministic and responsive browser checks for three text prompts, ordinal switching, and skeleton insertion.
- [x] Add explicit five-role Canvas binding controls, aggregate missing/duplicate diagnostics, and latest-saved-revision draft preflight while keeping launch revision checks strict.

## Risk And Rollback Points

- Keep all client-supplied schedule filters and actions validated at the server ownership boundary.
- Do not modify or requeue accepted provider submissions while adding scheduler pause/retry behavior.
- Keep launch atomic and start workers only after the transaction completes.
- Preserve existing Canvas workflow/run JSON compatibility and current user changes in overlapping files.

## Verification

- Focused scheduler and prompt-switch deterministic scripts under `.trellis/verification/`.
- `npx --no-install tsc --noEmit`
- focused ESLint for touched TypeScript files, then `npm run lint`
- `npm run build`
- `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` with a safe smoke port when needed
- `npm run local:restart`
- authenticated mocked browser checks at 1440x960 and 390x844 without external provider calls
