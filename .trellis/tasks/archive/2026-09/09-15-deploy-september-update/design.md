# Deployment Design

- Preserve application history and deploy the verified commit through the existing wrapper only.
- The only source change is a shorter status summary; task artifacts capture release preparation.
- Verify in the primary worktree and remote Docker verification target before activation.
- Capture current release, service identities, volume mounts and queue counts with read-only commands; keep raw diagnostics local or on the server.
- Back up PostgreSQL on the same server with root-only permissions and validate its archive listing.
- Use the installed rollback path if required health or identity acceptance fails.
- After parity succeeds on clean release HEAD, record completion metadata and push it only to local, following the prior production task convention; main stays on the deployed SHA.
