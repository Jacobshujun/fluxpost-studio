# Implementation Plan

1. Replace the Dreamina adapter with an Ark Seedance adapter.
   - Define typed submit/result contracts and conservative validation.
   - Implement create/status HTTP calls with timeout, Bearer auth and provider error decoding.
   - Normalize Ark task states and video output without internal polling.
2. Rewire Canvas execution and preflight.
   - Submit once and persist Ark task ID.
   - Query the same task on resumed worker passes.
   - Replace Dreamina credit preflight with local Ark configuration readiness.
3. Update node and application configuration.
   - Present Seedance 2.5 fields and defaults while retaining node version 1.
   - Add Ark Seedance model/timeout settings and remove active Dreamina settings.
   - Preserve old saved-node loading through explicit defaults for new booleans.
4. Update deterministic verification.
   - Replace Dreamina source assertions with Ark endpoint/auth/request/status/error assertions.
   - Verify no baseline path calls the live provider.
5. Run verification and convergence checks.
   - Focused Canvas workflow verification.
   - `npm run lint`.
   - `npx --no-install tsc --noEmit`.
   - `npm run build`.
   - Trellis baseline from `.trellis/spec/fluxpost/verification.md`.
   - `git diff --check` and targeted secret/runtime-data review.

## Risky Files And Rollback Points

- `src/lib/canvas/runs.ts`: preflight result shape is consumed by run confirmation UI.
- `src/lib/canvas/executors.ts`: provider task persistence must remain submit-once/query-later.
- `src/lib/config.ts` and `src/lib/types.ts`: removing Dreamina status fields requires searching all consumers first.
- `src/lib/canvas/registry.ts`: do not bump `model.seedance` version without a graph migration mechanism.
- `.trellis/verification/canvas_workflows_check.mjs`: checks must stay deterministic and must not contain real credentials or network calls.
