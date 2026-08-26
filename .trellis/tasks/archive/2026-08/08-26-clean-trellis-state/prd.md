# 清理并精简 Trellis 状态

## Goal

让 `.trellis/` 重新成为精简、无冲突、可从仓库证据恢复的唯一协作事实源，减少启动噪声和过期任务，同时不误删未完成工作。

## Background

- 2026-08-26 只读审计发现 29 个活动任务，但当前会话此前没有活动任务指针。
- `07-22-reference-image-library` 和 `07-23-vehicle-image-library` 同时存在活动版与 `completed` 归档版。
- 活动任务备注仍引用已经退役的 82/104 主机，与当前仅允许直接部署到 38 的稳定决策冲突。
- `architecture_rules.md` 要求重要工作总是更新 `handoff.md` 和 `progress.md`，与 `AGENTS.md`、`rules.md` 的按需更新规则冲突。
- `handoff.md`、`progress.md` 的最新块仍描述已经提交归档的 2026-08-20 工作。
- `project_brief.md` 记录了错误的旧项目路径。
- `verification.md` 的候选分支步骤与最终 `origin/main` 一致性门槛之间缺少明确衔接。

## Requirements

- R1：依据任务元数据、归档记录、提交历史、功能状态和稳定决策分类所有活动任务；不得仅按日期批量关闭。
- R2：消除活动区与归档区的同名任务冲突以及无法被任务工具识别的孤立目录。
- R3：对已完成、已被后续任务替代或前置条件已失效的任务完成生命周期收尾；保留确有未完成验收项的任务，并把下一步压缩为可执行事实。
- R4：统一 `handoff/progress` 更新条件，以 `AGENTS.md` 和 `rules.md` 的按需记录规则为准。
- R5：修正当前路径、服务器、发布和验证事实；历史事实留在归档，不应继续出现在当前入口中。
- R6：压缩重复规范，只在一个稳定事实源保留完整契约，其他入口使用短引用；不删除仍被代码或验证依赖的场景契约。
- R7：更新 `status.md` 为清理后的当前状态；仅在证据支持时更新功能状态。
- R8：不得修改应用代码、运行数据、媒体、密钥、环境配置或生产服务。
- R9：采用保守清理策略。仅归档有提交、完成归档副本或明确被后续任务替代证据的旧任务；证据不足的任务保留并压缩为 `待确认`。

## Acceptance Criteria

- [x] `task.py list --mine` 只显示有明确未完成事项的任务，不再出现已归档任务的活动副本。
- [x] 活动任务目录和归档任务目录不存在同名冲突或孤立任务目录。
- [x] 当前规范不再把 82/104 当作待验证或部署目标。
- [x] `AGENTS.md`、`rules.md`、`architecture_rules.md` 对 handoff/progress 的更新条件一致。
- [x] `project_brief.md` 使用当前项目路径，发布流程与 `origin/main`/固定 SHA 一致性规则自洽。
- [x] `status.md`、handoff/progress 最新块和 feature state 不互相矛盾。
- [x] 启动上下文仍满足 45 KB 上限，Trellis JSON、任务结构和最新标记校验通过。
- [x] `AGENTS.md`、`status.md`、`feature_list.json`、`rules.md` 四个默认启动文件合计不超过 35 KB。
- [x] 项目既有离线基线通过，且没有外部生产调用。

## Constraints

- 只记录可由仓库或用户指令确认的事实；不确定项标记为 `待确认`。
- 不读取或修改 `docs/harness.disabled/`、`scripts/harness.disabled/` 的归档内容。
- 不为了减少文件体积而弱化验证、架构边界或安全规则。
- 不提交、不推送、不部署，除非用户另行授权。

## User Decision

- 2026-08-26：用户批准保守清理策略，并同意把默认启动上下文不超过 35 KB 纳入验收。
