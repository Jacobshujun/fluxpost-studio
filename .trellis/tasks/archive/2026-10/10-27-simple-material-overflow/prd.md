# Fix simple-run material prompt overflow

## Goal

Fix the critical simple-run input overflow without truncating source content,
deleting assets, changing stored task snapshots, or silently reducing selections.

## Requirements

- Ordinary simple runs must not implicitly attach the browsable vehicle library.
- Text generation must not serialize material URL inventories into prompts,
  including original mode and explicitly resumed historical snapshots.
- Explicit viral reference selections and source-image processing must retain
  their existing ownership checks, ordering and image-generation semantics.
- A missing vehicle-library root must not widen the query to all assets.
- UI must distinguish available assets from actual task inputs; no new generic
  material picker is required for this focused repair.
- Do not automatically resume/replay failed tasks, migrate storage, call paid
  providers, or update the running LAN candidate during implementation.

## Acceptance Criteria

- [x] A 24,197-URL fixture cannot enter rewriting or original text prompts.
- [x] Material-list size does not increase either text prompt size; source title,
  body and user instructions remain intact.
- [x] Ordinary browser submissions carry no auto-populated library IDs.
- [x] Missing-root fixtures issue no unfiltered assets request and show a clear message.
- [x] Explicit viral selections still reach image pairing without selecting other assets.
- [x] Historical input fixtures cannot reproduce URL prompt expansion; stored
  snapshots are unchanged and no task is automatically replayed.
- [x] Focused runtime/API/browser regression checks, changed-file lint, types and
  build pass; full baseline outcome is accurately recorded, including existing blockers.

## Notes

- Evidence: src/app/page.tsx:218 and :581 automatically submit loaded IDs;
  :378 and :385 allow missing-root query expansion; src/lib/openai.ts:108 joins
  URL strings. src/lib/original-creation.ts:88 independently joins material URLs.
- Existing simple_config_sync_check.mjs asserts the erroneous automatic-ID
  plumbing; replace that assertion with the intended contract, not fewer checks.
- Earlier diagnosis: `.trellis/tasks/10-23-tos-oss-migration/simple-run-material-diagnosis.md`.
- First implementation scope excludes a new ordinary-mode material picker,
  general provider token-budget configuration and historical data cleanup.
