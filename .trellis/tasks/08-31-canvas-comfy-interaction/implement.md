# Canvas ComfyUI 交互实施

## Ordered Checklist

1. Update `src/app/canvas/page.tsx`:
   - initialize `paletteVisible` to `false`;
   - set React Flow `panOnDrag` to `true` on desktop and mobile-compatible existing behavior;
   - set `selectionKeyCode="Alt"` and `selectionOnDrag={!isMobile}`;
   - set `multiSelectionKeyCode={null}` so Ctrl/Meta clicks cannot bypass Alt-only multi-select;
   - leave node drag/connect, callbacks, context-menu quick add, and mobile guards unchanged.
2. Update `src/app/globals.css` only if needed to make the existing draggable/dragging/selection cursor states accurately reflect the new mode; avoid broad visual restyling.
3. Add or extend a deterministic focused check under `.trellis/verification/` for source contracts and mocked browser interactions. Do not call providers, Feishu, or production services.
4. Run focused check, `npx --no-install tsc --noEmit`, `npm run lint`, `npm run build`, and the baseline command from `.trellis/spec/fluxpost/verification.md`.
5. Run the desktop/mobile Canvas browser check at 1440px and 390px, recording viewport movement, selection-box behavior, palette default state, and overflow results.
6. Update `.trellis/spec/fluxpost/status.md` only with confirmed task outcome/evidence, then review the diff for unrelated changes before commit.

## Acceptance Mapping

- A1/A2: page parameter assertions and desktop pointer drag checks.
- A3: existing node/edge callbacks plus focused browser smoke for node click/drag, quick add, zoom, and shortcuts.
- A4: initial palette state assertion and toggle interaction.
- A5: mobile browser geometry and overflow assertion.
- A6: TypeScript, lint, build, focused checks, and full offline baseline.

## Rollback Points

- If React Flow selection behavior conflicts with panning, revert only the four interaction props and retain the palette default independently.
- If a browser check exposes mobile regression, restore the prior `isMobile` branch for that prop while preserving desktop Alt behavior; do not change persisted graph data.
