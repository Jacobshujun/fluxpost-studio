# Canvas history memory repair

User requests a larger local application heap and repair of the unbounded
Canvas history reads found in the November 4 crash investigation.

## Acceptance
- Local managed server allows 8 GiB old-space (previously ~4 GiB).
- Latest node history scales with nodes, not historical executions.
- Isolated execution can still find older compatible successful results.
- Owner isolation, iteration exclusions and ordering remain correct.
- Isolated SQLite/PostgreSQL, large-history, launcher and baseline checks pass.
- Commit verified changes and activate the sole LAN 3001 candidate safely.
- No deletion of history, provider replay or production deployment.
