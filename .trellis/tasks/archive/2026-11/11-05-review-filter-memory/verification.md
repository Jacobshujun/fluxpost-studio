# Verification — 2026-11-05

## Implemented
- Account/origin-local V1 applied-filter memory with explicit-URL precedence, entry gating, clear persistence and dedicated-link isolation.
- Ordinary-entry history metadata distinguishes list-selected postId after reload from newly opened post deep links. The shared URL hook accepts optional custom metadata; existing callers keep their behavior.
- Storage/session/corruption notices and empty-result clear action preserve the existing three-theme layout.

## Evidence
- `node .trellis/verification/review_usability_check.mjs`: passes including account keys, full-filter serialization, asOf exclusion, explicit empty filters, invalid/blocked storage and Beijing midnight today/7d recomputation.
- `node .trellis/verification/route_state_check.mjs` and `review_desk_workflow_check.mjs`: pass.
- TypeScript and focused ESLint: pass with no new warnings.
- Final full baseline: passes with 0 lint errors/16 pre-existing warnings, production build, HTTP smoke and SQLite checks. Log: `test-artifacts/review-memory-baseline-final.log`.
- Final intercepted browser memory suite: six theme/viewport combinations plus account gating (list/detail/metadata), new context persistence, ordinary reload then editing, cancel/apply/clear, back/forward, explicit/legacy/invalid URLs, dedicated post/batch URLs, frozen page clocks/refresh and corrupt/blocked storage/session failures pass. Log: `test-artifacts/review-filter-memory-browser-final.log`.
- Existing review usability browser suite: all 45 layout combinations and series/video/classic-scrollbar/drag/autoscroll/missing-card/save/history/draft cases pass. Log: `test-artifacts/review-memory-regression-browser.log`.
- Existing performance browser suite: 1,000-post desktop and 10,000-post mobile fixtures pass. Input P95 13.6/13.7 ms; select P95 14.4/15.3 ms. Log: `test-artifacts/review-memory-performance-browser.log`.
- All browser API/media traffic is intercepted on worker-disabled loopback port 45678; no paid model, production or real Feishu calls.

## Operational notes
- An initial legacy source assertion required updating for the new optional URL-hook metadata argument. The final full baseline uses that updated contract.
- Added feature records exceeded the 70 KiB Trellis context limit. Compact new entries and lossless movement of two older review verification entries to the existing archive restore the gate (44.34 KiB startup; 69.98 KiB typical). No check weakened.
- Delivery uses a verified commit and the primary worktree's existing `npm run local:lan` entry. Final runtime identity is verified through `/api/version`; activation logs/receipt remain ignored local state.
- Operator usability acceptance remains pending; feature status is `ready_for_review`.
