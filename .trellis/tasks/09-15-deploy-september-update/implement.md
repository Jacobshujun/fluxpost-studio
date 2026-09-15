# Execution

1. Run the documented full local baseline with TRELLIS_SMOKE_PORT=45678.
2. Commit preparation, push main/local atomically and verify remote SHAs.
3. Run installed verify-candidate.sh --check and --ref for the exact candidate SHA; require its passing manifest.
4. Inspect production health, identity, active jobs/queues, disk, volumes, protected services and rollback inventory.
5. Validate a same-host root-only PostgreSQL backup; run deploy.sh --check and --ref for the approved release.
6. Check production health/identity/routes/auth, schema, workers, logs, unchanged volumes/services, rescue tags and timer.
7. Check local work, activate clean current HEAD through npm run local:lan, then run npm run local:parity.
8. Record actual results in task verification and status, archive and commit bookkeeping only to local.
