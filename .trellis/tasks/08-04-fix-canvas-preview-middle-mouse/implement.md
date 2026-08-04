# Implementation Plan

1. Replace the preview stage's React wheel handler with a native non-passive listener and cancel middle-button default behavior in `src/app/canvas/page.tsx`.
2. Add a task-local deterministic Playwright regression check for exclusive preview zoom and preserved underlying canvas wheel behavior.
3. Run the focused browser check, changed-file lint, TypeScript, build, and the full baseline from `.trellis/spec/fluxpost/verification.md`.
4. Run `npm run local:restart` and verify the local `/canvas` HTTP boundary.
5. Review the diff, update Trellis feature/status evidence only with confirmed results, commit task-owned files, and push the exact commit.
6. Capture production release identity and protected-service state, deploy the exact SHA to 38 through the installed wrapper, and run read-only post-deploy checks.

## Rollback Gates

- Stop before commit if the focused interaction check or full baseline fails.
- Stop before production mutation if local/GitHub/candidate SHA identity is ambiguous or production has active Canvas queues that make restart unsafe.
- Rely on wrapper rollback for activation failure; use the captured prior release for a Canvas-specific post-check failure.

## Outcome

- Candidate and deployed SHA: `fedceccfda93401cc1539df034dbd1833647b4a3`.
- Production release: `20260804-023054-fedceccfda93`; retained rollback releases include `20260803-111421-e090bf683599`.
- Focused mocked Chromium, local production restart, complete local baseline, and commit-bound isolated VPS verifier passed.
- Production preflight had zero active queues. Post-deploy identity, routes/auth, services, schema, workers, six volumes, logs, and rollback retention passed without provider or Feishu writes.
- One simple task created after activation was running with a healthy heartbeat; it was not interrupted or modified.
