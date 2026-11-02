# Filters Execution

1. Start after previous children; freeze V1 shape, normalization/empty semantics,
   input limits, relative-bound lifecycle and legacy URL mapping.
2. Add failing pure contract/date cases: operators, malformed values, 50/51 leaves,
   max depth, host timezone differences and invalid URL behavior.
3. Implement intent/resolved types, validation and injected-clock calendar helpers.
4. Extend SQL/candidates; run identical isolated SQLite/PostgreSQL fixtures and
   explicit cross-owner/source-batch OR escape tests.
5. Integrate GET error mapping, new/legacy precedence and compact cursor pages.
6. Integrate atomic URL/Hook keys/resets/race guards; preserve unsaved text/order
   and freeze bounds across paging.
7. Build search selector, candidates, advanced groups/summary, clear/apply/cancel;
   show Beijing time and search AND conditions explicitly.
8. Extend workflow/performance/browser checks for history, resets, cancel and races.
9. Benchmark representative queries; investigate regressions without full downloads.
10. Run parent baseline and integrated layout/ordering/filter matrix; record actual
    evidence without provider/publish calls or candidate activation.

Parent `implement.md` lists commands/server safeguards. PostgreSQL cleanup is
mandatory on failure. API-intercepted browser fixtures do not replace real SQL
checks.

Outcome (2026-11-02): implemented and verified with the parent integration. Pure
calendar/validation, isolated SQLite and disposable-schema PostgreSQL queries,
owner/batch isolation, URL history and browser panel cases passed; evidence is in
`../10-30-review-desk-usability/verification.md`.
