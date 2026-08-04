# Implementation Plan

1. Add shared Feishu progress/failure contracts and an owner-safe bulk generated-post lookup.
2. Make the manual API accept ids and perform only authentication, bulk lookup, durable enqueue, logging, and the `202` response.
3. Move tag enrichment, vehicle normalization, approval persistence, and related validation into worker preparation.
4. Refactor Feishu publishing around ten-post chunks, per-chunk error isolation, durable progress callbacks, and one final notification.
5. Merge preparation/media/record/attachment outcomes into final posts and one aggregate job result.
6. Update the review desk request, real progress rendering, polling, and active-job restoration.
7. Expand deterministic queue/resume/media/review checks for 50-post staging, chunk boundaries, partial failure, idempotency, and ownership.
8. Run focused checks, `npx --no-install tsc --noEmit`, scoped lint, `npm run build`, and the full baseline with `TRELLIS_SMOKE_PORT=45678`.
9. Run `npm run local:restart` and local HTTP smoke without external production calls.
10. Update FluxPost decisions, architecture rules, status, feature evidence, and verification evidence only with confirmed results.

## Verification Evidence

- Focused Feishu batch/queue/resume/media/vehicle, simple queue, review desk, and ownership checks passed without external calls.
- `npx --no-install tsc --noEmit`, scoped ESLint, `npm run build`, and the complete Trellis baseline passed. Baseline lint retained only five existing Canvas warnings.
- `npm run local:restart` refreshed `http://127.0.0.1:3001/`; local HTTP smoke passed.
- Read-only Chromium checks rendered `/review` at desktop and 390x844 with no horizontal overflow, page errors, or console errors. No publish action was submitted.

## Rollback Points

- Stop before external-publisher refactoring if the id-only enqueue path cannot preserve owner visibility and duplicate detection.
- Stop before local restart if any deterministic chunk/idempotency check fails.
- Production deployment and live Feishu writes require separate operator approval.
