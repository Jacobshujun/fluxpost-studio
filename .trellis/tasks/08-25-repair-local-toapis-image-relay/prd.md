# Repair local ToAPIs image relay connectivity

## Goal

Restore connectivity between the port-3001 local FluxPost application and the configured ToAPIs image relay so image-provider requests can reach the existing asynchronous ToAPIs workflow with actionable failures.

## Background

- The user reports that the local application cannot communicate with the ToAPIs image relay.
- FluxPost already owns ToAPIs protocol mapping in `src/lib/toapis-image-api.ts` and provider orchestration in `src/lib/image-generation.ts`.
- The active local configuration resolves `toapis.com` with the `toapis_async` profile and has the required non-empty provider fields.
- DNS resolution succeeds, but a direct TCP connection from this workstation to `toapis.com:443` times out before any HTTP request is sent.
- Windows Internet Settings has an enabled loopback proxy. Both PowerShell and Node 24 reach `https://toapis.com/v1` through it and receive the expected unauthenticated HTTP `404`, while the current local-candidate process environment has no standard proxy variables and Node does not use the Windows proxy automatically.
- Provider credentials and local runtime configuration are sensitive local state and must not be copied into Git, Trellis, command output, or responses.

## Requirements

- Identify and fix the concrete local connectivity failure rather than adding a silent fallback or bypass.
- Make `npm run local` and `npm run local:lan` pass an enabled Windows user proxy to Node through its standard proxy environment when no explicit process proxy is already configured; explicit environment configuration must retain precedence.
- Preserve loopback access through an explicit local `NO_PROXY` boundary so the app, health checks, local ComfyUI, and other localhost services are not sent through the external proxy.
- Preserve the existing ToAPIs asynchronous submission, status polling, accepted-task resume, reference upload, backup-route, and generated-media persistence contracts unless the root cause proves one of them incorrect.
- Keep external calls server-side and surface an actionable, credential-safe error when the relay is unavailable or misconfigured.
- Limit edits to the directly affected configuration/provider boundary and deterministic regression coverage.
- Do not mutate production configuration, TOS objects, user runtime data, or paid provider state during default verification.

## Acceptance Criteria

- [ ] The original local failure is reproduced or otherwise evidenced and traced to a specific code/configuration boundary.
- [ ] A deterministic local-runtime check covers proxy precedence, enabled Windows proxy adoption, and local-address bypass without making a network call.
- [ ] A focused deterministic regression fails before the fix and passes after it without calling a live paid provider.
- [ ] The configured local ToAPIs route can complete a safe connectivity or provider check from the port-3001 application, or any remaining external failure is proven outside FluxPost with an actionable HTTP/network error.
- [ ] Existing project type, lint/build, and Trellis baseline commands required by `.trellis/spec/fluxpost/verification.md` pass.
- [ ] No secret values or local runtime data are committed or recorded in task artifacts.

## Out Of Scope

- Changing ToAPIs accounts, billing, credentials, or provider-side service configuration.
- Production deployment or changes to production/VPS configuration.
- Refactoring unrelated image-generation, Canvas, or TOS storage behavior.

## Technical Notes

- Root cause: `scripts/local/restart.ps1` starts the Next.js Node process without proxy environment variables; Node therefore attempts a blocked direct connection even though the workstation browser proxy is enabled.
- Planned files: `scripts/local/restart.ps1` and `.trellis/verification/runtime_parity_check.mjs`. No image-provider protocol or application configuration schema change is required.
- Verification: run the focused runtime-parity and ToAPIs checks, the repository baseline from `verification.md`, then commit and activate the clean port-3001 candidate before a bounded unauthenticated relay handshake.
- Use repository-defined verification commands only; live checks must be explicit, bounded, and avoid printing request authorization or raw provider bodies.
