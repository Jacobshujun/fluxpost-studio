# Verification - 2026-09-17

- Read-only runtime diagnosis confirmed the reported workflow's saved image layer
  referenced a prior generated image; the next run produced a different image
  identity while the video identity remained unchanged. No runtime rows changed.
- `node .trellis/verification/canvas_layer_compose_check.mjs` passed real PNG/MP4
  rendering across upstream replacements, preserved geometry/crop, cache freshness,
  legacy matching, wrong-origin rejection, single-to-multiple ambiguity, duplicate
  content from separate nodes, binding validation, serialization and clipboard.
- `node .trellis/verification/canvas_iteration_runs_check.mjs` passed including a
  real run-dispatch assertion that input bindings reach the composition executor.
- Full `check.ps1` baseline passed with exit 0 on worker-disabled port 45680:
  domain checks, lint (0 errors, 17 existing warnings), TypeScript, production build,
  HTTP smoke and SQLite. Log: test-artifacts/layer-compose-rerun-baseline-final.log.
  An initial baseline found an isolated test import requiring the new shared module;
  it was corrected. Another smoke attempt encountered an existing listener on 45678;
  the final baseline used a free port without stopping the unrelated listener.
- Browser fixture passed creator/professional/editorial at 1440/390: changed computed
  output previews after reload, persisted node/port binding, legacy explicit
  replacement preserving crop, geometry/undo/redo/audio/contrast and loading checks.
  All APIs/media intercepted. Narrow screenshot inspected. Smoke used 45679 with
  background workers disabled, then stopped.
- No paid generation, source crawling, Feishu publishing or runtime workflow edits.

Delivery limitation: local activation requires the primary worktree to be clean.
A concurrent canvas-feishu-compression task appeared during this change; its files
are left untouched. After that work is committed, use `npm run local` to activate
the clean HEAD and verify `/api/version`. No guard bypass or alternate worktree.
For existing URL-only layers, select the layer, replace with the current upstream
asset, then Apply once; position, size and crop are retained. Multi-item selections
remain content-bound and need explicit reselection when that content disappears.
