# Implementation

- [x] Add a reusable Dongchedi HTTP/request guard and category parser. Reuse the existing article normalizer and media cache; add fixture-friendly exports for URL validation and category extraction.
- [x] Extend `SimpleRunInput`, normalization, queue workflow, stage messages, per-link results, terminal cleanup, and API validation for `dongchedi_page`.
- [x] Add the workbench source-mode controls and progress/status rendering. Keep the existing draft review and publish boundaries.
- [x] Add deterministic category-page verification and include it in the Trellis baseline without network access.
- [x] Run focused checks, lint, type-check, build, local smoke/baseline; update status and feature evidence only after passing verification.
