# Design

Set --max-old-space-size=8192 on the managed local Next child only. Preserve
fatal-report flags, log retention, normal workers and rollback. Test effective
heap size in a real child process, without allocating that memory.

History queries rank eligible node-run IDs in SQL, then join full records only
for one winner per node. Apply ownership, parent-only and graph-node existence
before ranking; successful projections also require nonempty outputs. Keep
attempt order (node updated, run created, attempt) and success order (run
created, attempt), with node-run ID as a deterministic tie breaker.

Reuse needs older compatible inputs/configs: query one needed node at a time
in 32-record keyset pages, preserving successful status and old-output search.
Stop at the first compatible result; never collect all candidates in memory.
Shared SQL builder supports PostgreSQL and SQLite without a schema migration.

No API/UI payload or history retention change. Memory is bounded by node
count/page size, though single exceptionally large node outputs remain large.
Use isolated fixtures; live read-only aggregates can verify reduction without
loading the previous multi-GiB query. Retain previous build slot for rollback.
