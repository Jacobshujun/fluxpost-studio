# Implementation and validation

1. Shared types/helpers, serialization, clipboard and fingerprint projections.
2. Group renderer; main selection/state/history; inner equivalent with local history and clipboard.
3. Deterministic and intercepted-browser regressions at 1440/390 in three themes.
4. Full baseline: `$env:TRELLIS_SMOKE_PORT="45678"; powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`.
5. Record evidence/update Trellis, commit, activate through primary-worktree local wrapper, verify /api/version and /canvas. Preserve existing listener binding.
