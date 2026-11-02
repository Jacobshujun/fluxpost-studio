# Review Image Ordering

## Goal And Scope

Own O1-O4 in `../10-30-review-desk-usability/prd.md`. Ordinary/series ordering
must not drift prompts, preview identity, candidates, QA or regeneration anchors.

## Requirements

- Handle drag insertion with feedback, edge autoscroll, cancel and up/down
  keyboard/touch alternatives. File drops remain uploads, not reorder commands.
- Local changes persist through existing Save; display/publish use saved first
  available image. Duplicate URLs do not collapse identity.
- Persist ordinary prompts in image order; initialize missing legacy arrays using
  current resolver precedence. Do not reorder source `imageTasks`.
- Series moves retain stable ID/role/prompt/candidates/QA and update indices.
  All cards, including missing-image cards, move freely by insertion. No fixed
  original slots or reserved positions; no cards or their data disappear.
- Disable ordering during upload/replace/generation/save; incompatible operations
  cannot start mid-drag. Async results stay bound to original post/card/slot.
- Regeneration follows semantic cover identity; moved cover never self-references,
  and content at index zero still requires a cover reference.

## Acceptance Criteria

- [ ] First/last and multi-position moves, cancel and no-op drops.
- [ ] Duplicate URLs, preview and prompt pairing through save/reload.
- [ ] Upload/delete/replace then reorder; pending operations prevent ordering.
- [ ] Move images across missing cards and move missing cards to first/last or
  intermediate positions; no reserved slots, lost cards or overwritten images.
- [ ] Candidates/QA follow ID; order indices and save/reload order remain valid.
- [ ] Moved cover/content regeneration gets correct mocked references.
- [ ] Source tasks, image pixels/text and card roles unchanged.
- [ ] Approval/publish payloads retain saved order.

## Dependencies

After layout. User confirmed free ordering without fixed missing-card slots on
2026-10-30. Filters follow; integration checks filter/history changes while local
order is unsaved.
