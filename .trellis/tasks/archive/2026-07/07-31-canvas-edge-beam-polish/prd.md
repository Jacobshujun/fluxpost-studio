# Canvas 流光视觉优化

## Goal

Replace the current hard white dash-like Canvas edge highlight with a restrained, source-colored energy pulse that remains legible on short and long connections without overwhelming dense workflows.

## Requirements

- Keep one continuous source-colored base path on every business edge.
- Keep a weak animated pulse on idle edges and strengthen it for selected edges or edges connected to queued/running nodes.
- Render the pulse as a soft trail, colored body, and short bright core with rounded ends.
- Size the pulse from endpoint distance so long edges do not produce proportionally huge highlights.
- Keep deterministic per-edge phase offsets and source-to-target motion.
- Suspend animated layers during viewport movement and suppress them for `prefers-reduced-motion` while retaining the static base path.
- Do not change Canvas persistence, API, database, graph, execution, or provider behavior.

## Acceptance Criteria

- [x] Long edges no longer show a long hard-edged white bar; the moving body remains roughly 40-70 Canvas units and the trail remains bounded near 110 units.
- [x] Short edges retain a visible but proportionally bounded pulse.
- [x] Idle, hover, selected, and queued/running states have a clear visual hierarchy without changing business colors.
- [x] Multiple visible edges use stable non-synchronized phases and move from source to target.
- [x] Viewport movement and reduced-motion behavior retain the existing performance and accessibility contracts.
- [x] Focused Canvas checks, TypeScript, lint, build, the full Trellis baseline, local restart, and browser inspection pass without external provider calls.

## Notes

- Preserve unrelated dirty-worktree changes, including the copy-pool selection work in `src/app/canvas/page.tsx`.
