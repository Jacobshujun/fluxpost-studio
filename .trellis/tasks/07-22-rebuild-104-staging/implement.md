# Implementation Plan

1. Extend deploy/bootstrap scripts for resolved refs, legacy-compatible immutable image tags, release manifests, private app-only bootstrap, and accurate rollback.
2. Extend deterministic VPS deployment checks and Ubuntu deployment documentation for the new contract and safety boundaries.
3. Run focused deployment checks, lint, type-check, build, and the full Trellis baseline.
4. Read production and 104 state without exposing secrets; require matching production release/container/GitHub SHA evidence.
5. Record the 104 unrelated-service baseline, delete only verified FluxPost resources, and rebuild private staging at the production SHA.
6. Verify staging health/isolation and compare `x-ui`, `xray`, and `frps` identities/listeners against the baseline.
7. Update Trellis status/verification evidence with confirmed results and unresolved manual integration steps.

## Rollback Points

- Before remote deletion: stop if any resource ownership or production SHA evidence is ambiguous.
- During staging deployment: no production mutation is permitted.
- During future production deployment: activation failure restores the prior image/release while preserving all volumes.
