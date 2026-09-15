# Deploy September update to production

## Goal

Deploy the September GitHub update to the existing production host 38.76.210.136 using the installed exact-SHA verifier and deployment wrapper.

## Requirements

- User explicitly authorized deployment and identified the existing local SSH directory.
- Correct the status-summary context budget regression: a2516da exceeded the 70 KB gate by 7 bytes after the previous application baseline passed.
- Preserve configuration, named volumes, credentials, runtime data and existing services.
- Keep production credentials and runtime payloads out of repository artifacts; no provider generation or Feishu writes.

## Acceptance Criteria

- Full local baseline passes on the final candidate; commit and synchronize main/local before remote verification.
- Isolated remote verification passes; production preflight proves healthy services, no active work, rollback availability and a validated root-only PostgreSQL backup.
- Production identity, routes/auth, schema, workers, volume/service preservation, rescue tags and cleanup timer pass after deployment.
- Activate the matching local candidate after checking active work, preserve LAN binding and verify local/GitHub/production parity.

## Notes

- Starting GitHub main/local: a2516da84a9a7073a779a3362617131adb1e0057.
- Starting production: e58b37b0767da79ea365c214945755a0e8a0c16b, release 20260826-094620-e58b37b0767d.
- Starting local candidate: 9dba663e29b99fbe9f14837a820cb90f95cc53e6 on LAN port 3001.
- SSH succeeds with the existing codex_isvoro_hk_pro_ed25519 identity from the user-specified directory.
