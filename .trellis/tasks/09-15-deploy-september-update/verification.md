# September Production Deployment

Date: 2026-09-15

## Result

- Deployed commit: 12982377aaa8a5dcbb2c31d711c24672af7e7e43.
- Release: 20260915-150507-12982377aaa8 on the existing production host.
- Public entry: https://flux.lightmoment.net.
- User explicitly authorized production deployment; the existing local SSH identity resolved access without changing server authentication.
- GitHub main remains the deployed SHA. Completion metadata is committed only to local, following the prior deployment convention.

## Preparation

- a2516da failed the exact final-document context gate by 7 bytes. Shortened status.md without weakening the gate or changing application code.
- Full local baseline passed, including offline contracts, lint (0 errors, 17 existing warnings), TypeScript, production build, configuration synchronization and HTTP/SQLite smoke. Ignored log: .tmp-production-deploy-baseline.log.
- Clean candidate was committed and both GitHub main/local refs were verified at the candidate SHA before deployment.
- Installed remote verifier v1 built from a clean Git archive and passed the complete Linux offline baseline, writing /opt/fluxpost-studio/verifications/12982377aaa8a5dcbb2c31d711c24672af7e7e43.manifest with result=passed. Verification timestamp: 2026-09-15T15:04:29Z. Ignored log: .tmp-production-candidate-verification.log.
- Read-only production preflight and a final pre-activation recheck found no nonterminal production work. Application, PostgreSQL, public routes, Nginx and loopback binding were healthy.
- PostgreSQL custom-format backup was kept only on the production server with mode 0600; nonzero size and pg_restore --list validation passed. Final backup: /opt/fluxpost-studio/backups/pre-12982377aaa8-final-20260915-150504.dump (12,541,552 bytes).
- Installed deploy wrapper v4 completed exact-SHA build, activation, health, image retention and timer setup with exit code 0. Ignored log: .tmp-production-deployment.log.
- Completion metadata passed the full local baseline again, including the context budget, lint/types/build and isolated smoke. Ignored log: .tmp-production-completion-baseline.log.

## Post-Deployment Acceptance

- Public /api/version, runtime environment and release manifest agree on the full SHA and production mode; normal workers remain enabled.
- /, /canvas, /library, /review, /copy-library, /api/config and /api/version return 200.
- Unauthenticated /api/canvas/workflows, /api/library/assets, /api/review/posts and /api/review/posts/metadata return 401.
- Application/PostgreSQL containers are healthy; Nginx remains active; app port 3101 remains loopback-only.
- Unified-library migration marker exists; smart-folder/favorites tables and five review indexes exist; retired library roles are migrated. Asset count remains 64 and generated-post count remains 1369.
- All six FluxPost named-volume mappings remain unchanged; the global volume-name inventory hash is unchanged. The init SQL bind path follows the new release as expected.
- xkn-ppt-api, xkn-ppt-web and open-webui retain their container IDs, start times and healthy state.
- Post-start application and PostgreSQL log scans contain zero error markers.
- Image-retention preview keeps current plus exactly two rescue tags; unused verification/older image tags were removed. Prior release 20260826-094620-e58b37b0767d remains available, with its image preserved by rescue-20260915-150507.
- Weekly BuildKit timer is enabled and active; next observed run is 2026-09-21 00:00:00 UTC.

## Local Activation Deferred

- Local read-only diagnostics found active Canvas and image-generation work, including running queue entries. Port 3001 remains on 9dba663e29b99fbe9f14837a820cb90f95cc53e6 with LAN binding; it was not restarted or interrupted.
- npm run local:parity was executed on clean release HEAD and correctly failed because the local candidate runtime differed from HEAD. Production/GitHub identity succeeds independently; full local parity is not claimed.
- After local work finishes, prepare the intended clean GitHub candidate in the primary worktree, preserve LAN binding with npm run local:lan, and require full-SHA parity before claiming local alignment.
- No paid provider generation, TOS write, Feishu publish, configuration copying or runtime-data transfer was performed.
