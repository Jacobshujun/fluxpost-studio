# Add ordered expanding GPT image inputs and node controls

## Goal

Expose ordered expanding reference inputs on the ordinary Canvas GPT-Image-2 node and make existing generation controls directly accessible.

## Requirements

- Show image_1 initially, then connected numbered ports and one available trailing port, up to image_16. One edge per numbered port; image groups preserve internal order.
- Execute references in numeric port order, independent of connection creation order. Keep legacy uploads and references edges ahead of numbered ports.
- Preserve port identities through disconnect, reload, cloning and nested iteration editing.
- Expose ratio, resolution, quality, count, background and output format on the node, with computed pixel dimensions. Official requests already use these pixels.
- Keep existing provider route selection; custom model routing and arbitrary dimensions are outside this task.
- Preserve async resume, snapshots, bypass, total reference limit and transparent PNG validation.

## Acceptance Criteria

- [x] Deterministic ordering, limits, persistence, graph planning, bypass and provider resume checks pass.
- [x] Mocked desktop/mobile browser checks confirm expansion, stable numbering, controls and persistence.
- [x] Full offline baseline passes without live services or restarting the active port-3001 candidate.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
