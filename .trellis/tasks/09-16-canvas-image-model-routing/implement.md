# Implementation

- [x] Node fields, serialization, UI, executor propagation and fingerprint.
- [x] Explicit ToAPIs formats, route compatibility and safe errors.
- [x] Focused isolated checks and browser save/reopen/copy coverage.
- [x] Full existing baseline and facts.
- [ ] Archive and commit.
- [ ] npm run local and port-3001 identity verification.

Baseline: TRELLIS_SMOKE_PORT=45678; powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1. Browser uses worker-disabled smoke and intercepted APIs. No paid generation.
