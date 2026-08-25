# Implementation Plan

1. Add `read-excel-file` and a `competitor-workbook` domain service for constraints, parsing, hashing, preview, and frozen types.
2. Add the administrator-only inspection API and verify authorization, redaction, and explicit errors.
3. Extend Canvas types, registry, executor, icon, and node controls for normal row/card runs.
4. Extend V2 parameter sources and preflight to freeze hierarchical rows/cards and shared references.
5. Add progressive schedule concurrency from 1 to 5 and preserve pause, resume, cancel, and restart reconciliation.
6. Add ordered row aggregation, unique draft persistence, partial/failed status, card retry synchronization, and row retry.
7. Add a composable preset that reuses prompt-template, GPT-Image-2 V2, reference image, and social-post composition nodes.
8. Extend the Canvas batch panel for workbook inspection, worksheet/range, shared-reference summary, concurrency, and review metadata.
9. Add temporary Excel fixtures and deterministic checks for 200/778 parsing, invalid inputs, hierarchy, ordering, concurrency, recovery, and partial drafts.
10. Run TypeScript, lint, build, full Trellis baseline, and `trellis-check`; fix findings.
11. Update FluxPost status/feature evidence, propose a commit plan for user confirmation, then run the clean committed port-3001 candidate and responsive browser checks.

## Affected Areas

- `package.json`, `package-lock.json`
- `src/lib/competitor-workbook.ts`
- Canvas types, registry, executors, scheduler, and persistence helpers under `src/lib/canvas/`
- An authenticated route under `src/app/api/canvas/`
- Canvas controls in `src/app/page.tsx` and `src/app/globals.css`
- Deterministic checks under `.trellis/verification/`

## Validation

- Targeted workbook/parser and scheduler checks
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`
- Clean committed `npm run local` candidate on port 3001 and responsive browser inspection
