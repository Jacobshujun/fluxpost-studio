# Canvas history memory bounds

## Contract

`GET /api/canvas/runs?workflowId=...` returns latest attempts and successful
outputs without materializing all historical node/run JSON pairs in Node.
`canvas/history-query.ts` ranks IDs in SQL and fetches JSON only for winners:
one per node, with no arbitrary recent-run cutoff. Both SQLite and PostgreSQL
apply owner access, iteration-child exclusion and snapshot-node existence
before ranking. Successful output selection skips empty output maps.

Attempt order: node updated time, run created time, attempt, node-run ID (all
descending). Success/reuse order: run created time, attempt, node-run ID.
The ID is the stable tie breaker. Admins may read all owners; members only
their own run JSON owner. Keep service-layer authorization checks as well.

Isolated execution searches successful results for each required node through
32-row keyset pages. Stop at the first compatible result. Do not collect pages
or restrict reuse to the newest page: older inputs/configs may still match.
Fingerprint, preview-edge identity, version and downstream-stale checks stay
in `isReusableCandidate`. Cursor fields follow persisted run created time,
node attempt and unique node-run ID. No history is deleted or rewritten.

## Evidence and limits

Nov 4 crash reports establish heap OOM; the exact fatal request is unproven.
The previous largest-workflow join represented 171,092 rows / 3.49 GiB JSON.
The repaired read-only queries return 25 rows / ~440 KiB each. This removes
history-count-proportional application allocation, but one enormous output,
many nodes, concurrent requests or unrelated allocators can still use memory.
Database query work still scales with history (observed ~4–6 seconds on the
largest real workflow); this repair does not claim constant query latency.

## Verification

`canvas_history_memory_check.mjs` is in the offline baseline. It tests real
SQLite SQL, ownership, missing snapshot nodes, iteration exclusions, ordering,
all successful statuses, empty outputs, three-page old compatible reuse,
early termination, ties, fingerprints and a 180,000-row fixture. Focused run:

```powershell
node --max-old-space-size=256 .trellis/verification/canvas_history_memory_check.mjs
```

Opt-in PostgreSQL uses loopback only, a unique temporary schema and finally
cleanup; it does not touch runtime tables:

```powershell
$env:CANVAS_HISTORY_POSTGRES = "1"
node --env-file=.env.local --max-old-space-size=256 .trellis/verification/canvas_history_memory_check.mjs
Remove-Item Env:CANVAS_HISTORY_POSTGRES
```
