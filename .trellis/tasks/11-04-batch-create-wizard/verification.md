# Verification — 2026-11-04

## Implemented
- `/batch-create`: four-step V2 wizard, explicit compatible bindings, all eleven parameter types, workbook presets/settings, two scopes/combinations, random ranges and advanced shared/aggregate settings.
- Existing workflow/schedule API and owner checks retained. Draft saves keep revision, edits invalidate preview, launch requires ready preview, same-record conflicts are displayed. Existing schedule controls and results/review/download links reused.
- Home and Canvas link to wizard; original Canvas receives workflowId, panel=schedules and scheduleId. Legacy V1 stays in original center.
- Shared scheduling components extracted into `src/components/canvas-schedule/shared.tsx`; old static checks read the relocated implementation without removing assertions.

## Evidence
- `node .trellis/verification/batch_create_check.mjs`: mutation-free edit, revision preservation, preview invalidation, input/output validation, source shapes and encoded links pass.
- Full `check.ps1` baseline: all checks pass, including lint (0 errors, 16 existing warnings), noEmit, production build, HTTP smoke, SQLite check. Log: ignored `test-artifacts/batch-create-baseline.log`.
- `python .trellis/verification/batch_create_browser_check.py`: professional/editorial/creator at 1440/390, six full workflows pass. Explicit binding, multiline editing, save/reload, generation settings, preview invalidation, launch, pause/resume, results/retry, duplicate, 409, dirty guard, legacy deep link and no horizontal overflow covered.
- Additional browser roundtrip mounts all eleven input types and workbook sources; rename/save/reload preserves snapshots, inner binding, invalid shared selections, range sampling and separator metadata. Directory selection reads mocked snapshot.
- Original `canvas_prompt_separator_browser_check.py` and `canvas_content_collection_browser_check.py`: both widths pass. Original scheduler and workbook offline checks pass.
- Screenshots inspected: desktop professional inputs and narrow creator inputs. Screenshot artifacts remain ignored under `test-artifacts/`.

## Boundaries
Browser requests intercepted; worker-disabled loopback port 45678 used only for tests. No paid models, actual collection, Feishu writes or remote deployment. Operator usability and live generation acceptance remain pending. Local candidate activation follows a clean verified commit.
