# Implementation

- [x] Node fields, serialization, UI, executor propagation and fingerprint.
- [x] Explicit ToAPIs formats, route compatibility and safe errors.
- [x] Focused isolated checks and browser save/reopen/copy coverage.
- [x] Full existing baseline and facts.
- [x] Implementation committed as 027bec0; archive follows this record.
- [x] npm run local and port-3001 identity/HTTP verification passed for 027bec0. Reactivate final archival HEAD to retain exact identity.

Baseline: TRELLIS_SMOKE_PORT=45678; powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1. Browser uses worker-disabled smoke and intercepted APIs. No paid generation.
