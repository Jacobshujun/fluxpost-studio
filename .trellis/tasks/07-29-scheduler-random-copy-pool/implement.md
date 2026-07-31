# Implementation Plan

1. Add a focused copy-assignment helper in `src/lib/canvas/scheduler.ts` that validates capacity and samples without replacement.
2. Use that helper during preflight and whole-batch resampling while preserving the existing copy for single-content resampling.
3. Update the batch editor wording in `src/app/canvas/page.tsx` from stable tag ordering to conditional-random behavior and show the matched candidate count.
4. Replace round-robin source assertions in `.trellis/verification/canvas_scheduler_check.mjs` with executable deterministic checks for unique sampling, insufficient capacity, and resampling wiring.
5. Run `node .trellis/verification/canvas_scheduler_check.mjs`, TypeScript, related-file ESLint, `npm run build`, the documented Trellis baseline, and `npm run local:restart`.
6. Update current Trellis feature/status/architecture facts only after verification provides evidence.

## Risk And Review Gates

- Preserve unrelated edits already present in scheduler, Canvas UI, verification, and spec files.
- Do not invoke live GPT/image providers, Feishu writes, or mutate user runtime data during verification.
- Confirm the local production server at `http://127.0.0.1:3001/` is refreshed after the build.
