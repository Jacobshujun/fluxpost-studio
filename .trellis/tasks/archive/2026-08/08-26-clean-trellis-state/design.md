# Trellis 清理设计

## Boundaries

- 任务层：检查 `.trellis/tasks/*/task.json`、对应规划文件、归档副本和 Git 历史，按证据分类。
- 事实层：以 `AGENTS.md`、`rules.md`、`status.md`、`project_brief.md`、`decisions.md`、`verification.md` 和定向架构章节为准。
- 历史层：完成证据保留在任务归档和 `.trellis/spec/fluxpost/archive/`，默认入口只保留当前摘要和索引。
- 不触碰应用源代码、运行数据、环境配置、媒体或远端服务。

## Classification Contract

1. 已存在同名 completed 归档副本：删除活动重复副本，保留归档版本。
2. 任务自身声明完成，且提交历史/稳定规范可验证：补齐完成元数据后归档。
3. 任务已被后续已完成任务或稳定决策取代：记录替代关系后归档。
4. 存在明确未完成验收：保留活动状态，删除过期主机前置条件并写出当前下一步。
5. 没有完成证据也没有明确剩余项：保留，备注为 `待确认`，不得猜测完成。
6. 无有效 `task.json` 的孤立目录：若已有同名归档且内容无独有证据，删除活动孤本；否则保留并报告。

## Spec Reduction

- 默认启动上下文只承载当前状态、功能状态、稳定工作规则。
- `feature_list.json` 每项只保留 1-3 条短证据；详细历史继续由已有 archive 文件承载。
- `handoff.md` 和 `progress.md` 只保留一个准确最新块及历史索引。
- 大型 `architecture_rules.md` 不做无关重写，只修正与上层规则直接冲突的句子。
- 当前路径和发布流程只在其权威文档修正，其他文件通过引用复用。

## Safety And Rollback

- 修改前记录 Git 状态和待处理目录清单。
- 同名活动副本只有在归档副本完整且可读取时才删除。
- 规范变化通过 Git diff 可完整回滚；不使用硬重置或工作树覆盖。
- 基线不得调用外部生产服务。
