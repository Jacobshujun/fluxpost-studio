# Keep Canvas viewport stable while editing text nodes

## Goal

Keep the user's Canvas position and zoom unchanged while editing inline text.

## Requirements

- Separate inline editor selection from explicit node navigation. The textarea focus/click handlers currently reach `focusCanvasNode` and its `fitView` in `src/app/canvas/page.tsx:486`.
- Keep node selection, inspector updates, caret placement, text persistence and keyboard editing intact. Shared text split/concatenate controls follow the same non-navigating selection contract.
- Preserve explicit node-location actions and manual pan, zoom and fit controls; no change to initial workflow framing or iteration-editor framing.
- User authorized implementation, automatic commit and LAN port-3001 activation on 2026-10-30. No remote deployment, runtime-data migration or emoji/rich-text work.

## Acceptance Criteria

- [x] Clicking, focusing, typing, pasting, moving the caret and switching inline text editors do not alter the viewport transform.
- [x] Selection/inspector and saved text still update; manual pan/zoom/fit and explicit node location still work.
- [x] Deterministic regression checks pass, with a pre-fix failure demonstrated; mocked desktop/mobile browser checks cover all three themes without runtime writes or provider calls.
- [x] Run the documented baseline and separately verify remaining gates if an unchanged blocker prevents completion.
- [ ] Commit verified changes, activate clean HEAD with `npm run local:lan`, and confirm exact-SHA identity, LAN binding and HTTP smoke.

## Scope

Lightweight frontend fix in `src/app/canvas/page.tsx`, regression coverage under `.trellis/verification/`, and task/status evidence under `.trellis/`. No API or schema changes.
