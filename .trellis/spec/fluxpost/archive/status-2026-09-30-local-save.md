# Layer composition status history

Preserved from status.md to keep the required startup context within budget.

- 2026-09-17: Review delivery diagnosis confirms the latest full run's composed
  video reaches the saved post, with captions visible in actual frames. A separate
  isolated render has different captions and no downstream post step. The exact
  operator-view mismatch is pending confirmation; task: layer-compose-review-trace.

- 2026-09-17: Latest local composition failed after successful MP4 persistence:
  TOS removed the local file before output hashing. Hashing now precedes storage;
  consuming-storage PNG/MP4 regressions and full baseline pass.
  Evidence: .trellis/tasks/archive/2026-09/09-17-layer-compose-persistence/verification.md.

- 2026-09-17: Layer composition reruns now bind single-item upstream outputs by
  node/port; old layers need one explicit replacement, retaining crop/layout.
  Full baseline and three-theme 1440/390 browser checks pass. Local activation is
  pending a clean worktree (concurrent canvas-feishu-compression task).
  Evidence: .trellis/tasks/archive/2026-09/09-17-layer-compose-rerun/verification.md.

- 2026-09-17: Layer editor loading batch one reuses uploaded metadata, removes preview
  hashing, caches/deduplicates probes and keeps editing available during source loading.
  Offline and desktop/390 browser evidence: .trellis/tasks/archive/2026-09/09-17-layer-compose-loading/verification.md.

- 2026-09-17: Layer editor white-on-white portal fixed. Three themes pass contrast,
  live switching and 1440/390 browser checks plus full baseline. Evidence:
  .trellis/tasks/archive/2026-09/09-17-layer-compose-theme/verification.md.

- 2026-09-17: Layer composition adds exact-size PNG/MP4, mixed image/video layers,
  visual crop/scale, hold/loop/hide and selected audio. Contract: canvas_layer_compose.md.
  Evidence: .trellis/tasks/archive/2026-09/09-17-canvas-layer-compose/verification.md.
  Operator acceptance pending; local delivery uses the clean-HEAD candidate wrapper.

