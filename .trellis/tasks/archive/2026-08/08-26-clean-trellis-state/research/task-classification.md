# 旧活动任务分类证据

审计日期：2026-08-26

## 原则

- Trellis 任务归档表示本次实现工作已结束，不等于对应产品功能已经通过所有人工或生产验收。
- 尚待人工、付费服务或生产验证的功能继续由 `feature_list.json` 的 `ready_for_review` 状态承载。
- 只有没有实现/替代/验证证据的任务才应继续处于活动目录。

## 删除重复活动副本

- `07-22-reference-image-library`：完整 completed 归档副本位于 `archive/2026-07/`，提交 `542cbb5` 和 `0f6e499` 记录实现与发布。
- `07-23-vehicle-image-library`：完整 completed 归档副本位于 `archive/2026-07/`，同一发布证据覆盖实现与验收。
- `08-04-canvas-main-shared-results`：活动区只是空目录；完整归档位于 `archive/2026-08/`，提交 `56c894d`、`46b1094` 可追溯。

## 归档实现任务

- `07-03-source-video-direct-reference`：PRD 8/8，现有 `source_video_reference_check.mjs` 纳入基线。
- `07-07-compact-simple-workspace-layout`：被 `07-22-compact-only-workspace` 和提交 `211aa65` 覆盖。
- `07-15-slim-local-next-build`：PRD 7/7，提交 `07eac87`；后续固定槽位实现继续强化该行为。
- `07-17-feishu-cli-auto-init`：PRD 7/7，提交 `81ef2d0`。
- `07-20-tos-runtime-media-storage`：提交 `303e597`、`0039408`；剩余生产 38 实体验证属于 feature review gate。
- `07-21-feishu-tos-media-recovery`：PRD 9/9，提交 `c743eca`。
- `07-22-compact-only-workspace`：提交 `211aa65`，当前首页契约和基线持续覆盖。
- `07-23-retire-104-staging-direct-38`：PRD 7/7，任务备注明确全部完成；稳定部署决策确认 82/104 已退役。
- `07-24-canvas-node-preview-flow`、`07-24-infinite-canvas-workflows`、`07-27-canvas-display-any`、`07-27-canvas-node-resizing`、`07-27-canvas-node-result-controls`、`07-27-canvas-shortcuts`、`07-27-canvas-title-body-splitter`：提交 `164cb9e`、`1b0b8d8` 及后续 Canvas 提交覆盖实现；执行清单完成，遗留外部验证由 feature review gate 承载。
- `07-28-canvas-batch-review-missing`、`07-28-canvas-batch-scheduler`、`07-29-flexible-canvas-batch-scheduler`、`07-29-scheduler-random-copy-pool`、`07-30-canvas-batch-image-source-controls`：提交 `6227c7e`、`5ac1101`、`3ece0f2`、`683cf9e` 及后续调度器修复覆盖实现。
- `07-29-remove-legacy-local-materials`：提交 `580c4f5`，当前 project brief 已确认旧素材域退休。
- `07-29-shared-libraries-sorting-selection`：提交 `f12392d`，稳定 decisions 场景与专项基线持续覆盖。
- `07-30-fix-canvas-zoom-visual-regressions`：PRD 6/6，提交 `b5aa7d4`、`817baf2`、`89abfac` 覆盖后续性能修正。
- `07-30-original-xhs-batch-workspace`：提交 `683cf9e`，feature state 和专项基线持续覆盖。
- `08-05-canvas-workflow-portability`：提交 `a887c15`，并曾由 `11aceda` 正式归档；活动副本是后续整合产生的状态回退。
- `08-06-production-docker-retention`：PRD 8/8、执行清单 7/7，提交 `6a8220c`、`ef8520f`。
- `08-17-dongchedi-current-article-paths`：PRD 5/5，提交 `918a6e7`。

## 结论

清理后除本次任务外不保留旧活动任务。产品层未完成的人工或生产验收仍保留在 feature state，不因任务归档被误标为 `done`。
