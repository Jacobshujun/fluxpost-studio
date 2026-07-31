# Implementation Plan

1. 扩展 Canvas 类型与节点注册表：加入 V2 schedule definition/runtime、typed parameter source/binding、batch-injectable field metadata 和 normalize/validation helper；保留 V1 类型分支。
2. 在 scheduler domain 实现纯函数参数解析与两层展开，覆盖 fixed、each、random、精确/闭区间抽取数量、每主任务独立子抽样、参数值去重、无放回抽样、cartesian、zip 区间交集、image-group、稳定排序、快照和 2,000 子任务上限；旧 `randomCount` 兼容为精确数量。
3. 实现通用节点注入 adapter、子任务图构造、artifact 提取及可选主任务聚合图构造；验证目标路径、artifact 兼容和 external-write 禁止规则。
4. 改造预演、原子启动、reconcile、暂停/取消、单子任务重试、候选接受和进程恢复，使 V2 使用 main/child 上下文，同时保留 V1 执行适配器。
5. 扩展 schedules API 的 save/preflight/resample/launch/retry/accept payload，服务端进行 schema 分发和 revision 校验；加入 V1 转换为 V2 副本操作。
6. 在 Canvas 节点检查器加入自定义名称编辑，统一卡片、运行计划、历史、错误和调度选择器的快照名称显示，并验证复制/模板/undo/autosave 保留 label。
7. 重构批量调度抽屉为执行节点、主参数、子参数、展开策略和两层预演/运行树；加入可编辑人物/场景/车辆角度预设、固定个数/随机范围控件及每主任务数量摘要，保证桌面和移动端无横向溢出。
8. 扩展 `.trellis/verification/canvas_scheduler_check.mjs` 与 `canvas_workflows_check.mjs`，覆盖 V2 精确/区间展开、随机边界、每主任务独立抽样、zip 区间交集、旧 `randomCount` 归一化、批次内无放回去重、容量不足、绑定、命名、冻结、原子性、聚合、重试、恢复、owner/revision 和 V1 兼容，不调用真实 provider。
9. 运行 `node .trellis/verification/canvas_scheduler_check.mjs`、`node .trellis/verification/canvas_workflows_check.mjs`、`npx --no-install tsc --noEmit`、相关文件 ESLint、`npm run build` 和 `.trellis/spec/fluxpost/verification.md` 中当时可用的 baseline。
10. 使用 mocked/local 数据完成 1440x960 与 390x844 浏览器检查：节点重命名、同类型绑定、人物/场景/三角度预演、部分/严格聚合、单子任务重试、无重叠和无页面横向溢出。
11. 通过质量检查后更新 FluxPost status、feature evidence 及必要的 architecture/verification 规则；前端和 API 变化需本地可见时运行 `npm run local:restart`。不执行真实付费 provider、飞书写入或生产部署，除非用户另行明确授权。

## Review Gates

- 开始实现前复读 `prd.md` 与 `design.md`，确认没有把示例业务名固化为 schema 字段。
- scheduler 核心改动后先通过纯函数和 V1 兼容检查，再接入 UI。
- API/数据库审查必须确认 launch 仍为一次 schedule + runs + queue 的原子事务。
- 聚合审查必须证明不会重新执行 child-result 上游付费节点。
- 完成前按 `.trellis/spec/fluxpost/verification.md` 报告 baseline 的已知缺口，不得弱化现有失败检查。

## Rollback Points

- 类型/展开层：可回退 V2 schema 分支而不影响 V1 JSON。
- 执行层：V2 使用独立 schema dispatch；回退时停止创建新 V2，保留历史记录供前向版本恢复。
- UI 层：参数编辑器和 V2 预设可独立撤回，节点 label 持久化仍与现有 Canvas 类型兼容。
- 无数据库 schema 或数据清理操作需要回滚。
