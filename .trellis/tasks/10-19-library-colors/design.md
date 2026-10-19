# Design

Shared client-safe color math plus server Sharp extraction: sample full first frame <=128px, alpha-weight visible pixels, weighted median-cut into 12 clusters, merge Lab neighbors <10, keep six by original coverage.

Store independent relational palette metadata and Lab/color rows plus durable jobs/items. Overlay palette on asset reads; never write palette into asset JSON. SQL EXISTS with Lab bounds and distance squared <=625, coverage >=0.05. Additive SQLite/PostgreSQL schemas plus migration SQL.

Imports analyze original bytes after asset persistence, failing palette independently. Explicit history batch captures manageable missing/stale or failed items. Atomic item claims, 120s leases, fences; two workers and startup wake. No silent retry of failed media. Source download reuses thumbnail safeguards.

Authenticated GET/POST /api/library/colors/jobs and GET /api/library/colors/jobs/[id]. POST mode missing|failed returns durable job; deduplicate active requester job. GET includes counts/errors and coverage. UI refreshes status only while active.

Shared swatch/filter components; gallery URL color; local Canvas node query; persisted V1/V2 schedule filter. Freeze original URLs as before. Preserve unrelated Gemini edits, no remote deployment.
