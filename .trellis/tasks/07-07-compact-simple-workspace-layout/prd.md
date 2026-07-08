# Expand compact simple workspace

## Goal

Expand the compact/simple homepage workspace so Mac Chrome desktop users can browse more of the one-click content production controls without the top chrome and bottom progress area squeezing the main work region.

## Requirements

- Desktop compact/simple mode must allow natural vertical page browsing instead of locking the whole frame to a clipped `100dvh` viewport.
- The compact bottom progress area must stay visible when useful but must not be `fixed` over the form or require large permanent bottom padding.
- Advanced mode must preserve its existing locked operational layout and internal scrolling.
- No API, simple-run payload, database, or environment behavior changes.
- Top account/theme/config/navigation controls must remain visible and keep the account popover layering fix intact.

## Acceptance Criteria

- [ ] `src/app/globals.css` releases compact/simple desktop height and overflow constraints while preserving advanced desktop constraints.
- [ ] Compact `simple-overall-progress` uses document-flow/sticky behavior instead of fixed overlay behavior on desktop and mobile.
- [ ] Existing static workspace account CSS regression passes.
- [ ] Typecheck, lint, and full Trellis baseline pass or any pre-existing limitations are reported.
- [ ] Local production server is refreshed for visual review at `http://127.0.0.1:3001/`.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
