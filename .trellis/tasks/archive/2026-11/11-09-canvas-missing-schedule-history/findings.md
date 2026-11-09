# Canvas schedule history diagnosis — 2026-11-09

## Confirmed cause

The Canvas modal requests the unfiltered `/api/canvas/schedules` endpoint. `listCanvasSchedulesFromDb(limit = 100)` selects the global most recently updated 100 full records before service ownership filtering and frontend workflow filtering. A workflow with no records in that global window therefore appears empty even while its records remain persisted.

Source: `src/lib/database.ts:3749`, `src/lib/canvas/scheduler.ts:116`, `src/app/api/canvas/schedules/route.ts:18`, `src/app/canvas/page.tsx:4299`.

Both global limit and frontend filtering originate in commit `6227c7e3` (2026-07-28), rather than the current preview changes. Runtime `/api/version` matched HEAD `e6daff1b22098c53e1887fca59e678808cf6bd09` during investigation.

## Read-only local evidence

Dedicated diagnostic connection; explicit `BEGIN READ ONLY`, bounded SQL, `ROLLBACK`. The reported workflow currently retains 23 schedule rows: 15 completed, six partial, two drafts. Created between October 22 and October 30; last updated October 30, 16:49 Beijing time. Their global updated-order positions were 248–468; zero were in the first 100. All 23 JSON workflow/owner fields agree with their row columns. Twenty-two share the workflow owner; one has another owner. Therefore member counts can differ from the administrator total. No claim is made about historical completeness beyond these existing rows.

## Existing alternative and repair direction

`/batch-create` → task records → workflow filter uses `view=summary` and `canvasScheduleListSql`, which applies ownership/workflow predicates in SQL before LIMIT/OFFSET and retrieves details by ID. Executing the exact SQL builder through the read-only diagnostic transaction returned all 23 rows for an administrator and 22 for the workflow owner as an operator, matching the counts. Browser authentication acceptance remains unperformed.

Repair should reuse scoped, paginated summary queries in the Canvas modal with detail reads on selection, retain account boundaries, and handle direct schedule links independently of the first page. Raising/removing the global full-JSON limit would leave truncation or memory growth risks. Add a regression with more than 100 newer unrelated schedules and older matching schedules. No application repair is included in this diagnosis task.

## Verification

- Diagnostic and application URLs resolve to the same loopback database (compared internally without printing credentials).
- Exact existing summary SQL returns 23 administrator / 22 owner rows; global first-100 SQL contains zero matching rows.
- Documented baseline executed with `TRELLIS_SMOKE_PORT=45678`. Final log reaches `Baseline verification passed.` after deterministic checks, lint, TypeScript, production build, built-config checks, HTTP smoke, and SQLite store checks. The outer PowerShell redirected invocation nevertheless reports exit 1 and renders native stderr warnings as `NativeCommandError`; retain this qualification rather than claiming a clean shell exit. No `Cross-platform baseline failed` footer appears in this final run.
- Initial context-budget failure after adding status text was corrected by shortening the status entry; final context gates pass.
- `git diff --check` passes. No source-code or runtime-record modifications; no 3001 restart. Logged-in browser walkthrough and application repair remain outside this analysis task.
