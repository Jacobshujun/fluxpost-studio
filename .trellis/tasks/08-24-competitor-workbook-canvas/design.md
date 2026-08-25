# Technical Design

## Data Flow

1. An administrator submits a server-local path and worksheet to a workbook inspection API.
2. `src/lib/competitor-workbook.ts` enforces file constraints, parses the workbook, normalizes headers, and builds a redacted preview.
3. Canvas batch preflight produces an immutable workbook snapshot for the selected range and freezes the graph's shared image references.
4. The scheduler models each row as a parent item and each card as a retryable child item, creating runs progressively up to schedule concurrency.
5. Child runs reuse the existing image path. At row settlement, successful image artifacts are sorted by card index and passed with frozen title/body to `compose.social-post`.
6. Public schedule DTOs expose filename/hash summary, row number, counts, and status only. The absolute source path stays in admin-only internal configuration.

## Shared Types

- `CompetitorWorkbookCardSnapshot`: card index, column name, and original text.
- `CompetitorWorkbookRowSnapshot`: source sequence, Excel row number, title, full body, and ordered cards.
- `CompetitorWorkbookSnapshot`: file hash/name, worksheet, frozen timestamp, range, and rows. Internal source path is separately redacted at DTO boundaries.
- Add structured workbook row/card artifacts instead of local casts from arbitrary JSON.
- Add a hierarchical workbook parameter source to Canvas V2 while preserving current list/shared/batch-image sources.
- Add `taskConcurrency` to `CanvasSchedule`, normalized to 1-5.

## Workbook Service

- Use `read-excel-file/node`, restricting extension, absolute path, byte size, and parsed row count.
- Read displayed text, trim whitespace, skip fully blank data rows, and scan the six card columns in order.
- Hash the bytes actually consumed at preflight. Never depend on the `校验` sheet's JSON path column.
- Keep the API route thin: authentication, request validation, service delegation, and response mapping.

## Scheduler Semantics

- Reuse current schedule/run/candidate persistence rather than adding a second queue.
- Launch/reconcile computes each schedule's admitted non-terminal child count and fills only to `taskConcurrency`; child terminal transitions wake reconciliation.
- Pause and cancel prevent new admissions; already-running work follows current run cancellation semantics.
- Use stable row/card keys. Persist each row's draft ID so retries update it rather than inserting a duplicate.
- `partial` is a row aggregate/draft metadata state, not a GPT node protocol change.

## UI

- Add workbook path, worksheet, test-row, test-card, and admin inspection controls to the Canvas node inspector.
- When a workbook source is present, the batch panel shows worksheet, inclusive row range, shared-reference summary, concurrency, and preflight output.
- Reuse current node/form/layout patterns and lucide icons, retaining dense desktop behavior and mobile responsiveness.
- Render structured errors. Do not cache or echo a sensitive source path beyond the administrator's own local input state.

## Security

- Both inspection and workbook-backed batch launch require a signed-in administrator.
- Never log request bodies or absolute paths; errors do not interpolate real paths.
- Explicitly redact path fields from schedule list/detail serialization and preserve workspace ownership checks.
- Tests create temporary workbooks outside repository runtime data and never use the desktop sample.

## Verification

- Add deterministic checks for parsing, hierarchical expansion, concurrency fill, aggregation, and retry.
- Statically assert the GPT V2 public definition remains unchanged with the 16-reference cap.
- Run TypeScript, ESLint, build, and the complete Trellis baseline.
- After a user-approved commit, replace port 3001 through `npm run local` and inspect desktop/mobile Canvas behavior in a browser.
