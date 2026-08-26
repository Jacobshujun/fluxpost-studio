# Implementation Plan

1. Inspect the prior 104 rebuild research and current SSH entry points without reading secrets; prepare a retirement audit/cleanup command with exact ownership guards.
2. Run a read-only 104 inventory and capture non-secret FluxPost resources, protected services, unrelated containers, and listeners.
3. Validate the deletion set against the PRD boundary; stop if any resource ownership is ambiguous.
4. Remove only verified FluxPost containers, network, volumes, application image tags, app root, staging credential file, and Caddy staging configuration from 104.
5. Run post-delete verification for resource absence, port/domain retirement, protected services, unrelated containers, and listeners.
6. Run read-only 38 release/manifest/container, app/PostgreSQL, loopback/public HTTP, Nginx, and unrelated-service health checks.
7. Update active Trellis facts and deployment decisions to make 38 the sole remote repair target and retire the old 104 rebuild task.
8. Read `.trellis/spec/fluxpost/verification.md`, run the full Trellis baseline, review the scoped diff, and record confirmed evidence.

## Verification

- Remote 104 audit before and after deletion using exact names/labels and protected-process comparisons.
- Remote 104 HTTP/listener checks for the retired app port and staging hostname.
- Remote 38 read-only release and service health checks.
- `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`

## Rollback Points

- Before deletion: abort if the SSH host identity, FluxPost ownership, or protected-service baseline is ambiguous.
- During deletion: stop immediately if any command target expands beyond the reviewed exact resource list.
- After deletion: do not recreate FluxPost on 104; repair only an accidental Caddy/protected-service disturbance using the captured pre-delete evidence.
- On 38: no mutation is planned; if a read-only health check fails, report and diagnose separately rather than deploying unrelated changes.
