# Ordering Execution

1. Start after layout is checked; apply the confirmed free-ordering policy.
2. Add failing insertion/identity/prompt/missing-card tests, including moves across
   missing cards, dragging missing cards themselves and filling one after reorder.
3. Add prompt type, patch registry, API validation and isolated save/reload tests.
4. Implement slot/card insertion transforms and ID-based preview/candidate edits.
5. Add drag handle, feedback, cancel, autoscroll and up/down alternatives.
6. Enforce async mutual exclusion and stale-result identity checks.
7. Fix cover lookup, guard and provider reference selection; mock all generation.
8. Extend workflow/performance and intercepted browser checks, inspecting publish
   payloads without actual Feishu calls.
9. Run parent focused commands/full baseline and record actual evidence.

Include duplicate URLs, multi-position moves, save/reload, changes following
replace/delete/upload and post switching during pending work. Commands/safety are
in parent `implement.md`.

Outcome (2026-11-02): implemented and verified with the parent integration. Pure
insertion, SQLite/PostgreSQL save/reload, intercepted drag/cancel/autoscroll,
missing-card moves and candidate/cover guards passed; evidence is in
`../10-30-review-desk-usability/verification.md`. No provider acceptance.
