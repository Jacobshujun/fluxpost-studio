# Implementation Plan

- [x] 扩展 Canvas V2 definition、main runtime、batch phase 和兼容 normalization。
- [x] 在 scheduler-v2 增加共享候选/依赖验证、artifact 提取和 literal graph 替换纯函数。
- [x] 扩展 launch/reconcile：创建 shared runs，成功后事务化 fan-out child runs，并覆盖恢复、暂停、取消和失败重试。
- [x] 增加 schedules API `retry-shared` action。
- [x] 扩展批量调度编辑器、预演树和运行树的共享阶段配置、状态、预览与重试。
- [x] 扩展 Canvas scheduler/workflow 确定性检查及 mocked Chromium 检查，不调用真实 provider。
- [x] 运行专项检查、TypeScript、lint、build、完整 baseline、`npm run local:restart` 与 HTTP smoke。
- [x] 更新 Trellis status 和 feature evidence，不把离线验证直接标记为 done。

## Rollback Points

- 类型/纯函数和 normalization 可单独回滚。
- runtime shared 分支通过空 `sharedOutputs` 与旧路径隔离。
- UI/API 只暴露已有 domain 能力，不新增数据库结构。
