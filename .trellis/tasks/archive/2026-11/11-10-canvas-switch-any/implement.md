# Implementation

1. [x] Pure selector, registry/type compatibility, execution/bypass validation and iteration integration.
2. [x] Compact node port/index UI, styling, quick-add/inspector integration.
3. [x] Baseline-registered deterministic checks and six isolated browser cases; related browser regressions pass.
4. [x] Full baseline passes with TRELLIS_SMOKE_PORT=45678; see verification.md.
5. [x] Reviewed full task diff; updated lightweight status/evidence and stable contracts. Commit/archive before activation.
6. Release procedure: clean primary-worktree npm run local, verify /api/version and HTTP health. No remote deployment or live providers.

Risk focus: actual type mismatches must not vanish in typed extractors; connected missing index must not fall back; bypass/isolated preflight must agree; sparse high ports must survive serialization.
