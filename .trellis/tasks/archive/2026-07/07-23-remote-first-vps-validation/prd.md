# Establish 104-first validation and production promotion

## Goal

Make 104 the mandatory verification gate for every code fix before promoting the exact same commit SHA to production 38.

## Requirements

- Keep local Windows use limited to clean-worktree editing, diff review, and Git operations. Do not use local application, build, test, or browser results as a promotion gate.
- Every candidate commit must pass the complete deterministic baseline on staging `104.243.21.233`, then run as the active staging release and pass the task-specific bug scenario.
- Production `38.76.210.136` may receive only the exact full commit SHA that passed staging. Any rebase, merge commit, amendment, or follow-up patch creates a new candidate that must restart staging verification.
- Candidate verification must run from a clean Git archive without reading server environment files, mounting FluxPost runtime volumes, starting application services, or calling live providers.
- Staging remains isolated from production accounts, PostgreSQL data, media, TOS prefixes, Feishu targets, provider credentials, and notifications.
- Code releases must use the installed deployment wrappers. Never edit `/opt/fluxpost-studio/current` or copy release/runtime state between servers.
- Failed candidate checks must not activate a release. Failed deployment health checks must restore the prior release and image. Business-check failures must use the manifest-aware rollback command.
- Database or historical-data repair requires a production backup and bounded batches after code promotion.

## Acceptance Criteria

- [ ] A cross-platform Node baseline runs the same deterministic checks, lint, TypeScript, Next build, HTTP smoke, and SQLite check as the Windows entry point.
- [ ] The PowerShell baseline remains a thin supported wrapper around the cross-platform runner.
- [ ] A Docker verification target runs the baseline without production configuration, runtime volumes, or live external services.
- [ ] `verify-candidate.sh --ref <ref>` resolves a full SHA, verifies a clean archive, records a non-secret manifest, and never changes running services.
- [ ] Bootstrap/deploy wrappers install or safely retain the versioned candidate verifier.
- [ ] Deterministic deployment checks cover valid/invalid refs, verification isolation, manifest output, and forbidden runtime/service mutations.
- [ ] The candidate passes full verification and deployment on 104 while Caddy, PostgreSQL, and protected `x-ui`/`xray`/`frps` services remain healthy.
- [ ] The same verified SHA is deployed to production 38 and passes release/image/manifest, app/PostgreSQL, Nginx/public HTTPS, volume, and Open WebUI checks.
- [ ] Trellis and operator documentation define 104-first validation as the only normal code-fix promotion path.

## Notes

- User authorization explicitly includes the initial 104 verification/deployment and subsequent production promotion of the same SHA.
- Paid or production-only probes remain separately authorized actions; default verification is offline.
