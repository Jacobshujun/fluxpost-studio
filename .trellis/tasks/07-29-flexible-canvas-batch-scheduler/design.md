# Design

## Architecture

V2 作为现有 Canvas DAG 上的一层参数化调度定义，不创建第二套工作流引擎。`src/lib/canvas/scheduler.ts` 继续拥有预演、冻结、原子启动、状态协调和聚合；普通节点执行仍由 `src/lib/canvas/runs.ts`、graph planner、executors 和共享 provider 并发池负责。

Schedule 增加显式 `schemaVersion: 2` 和通用 definition/runtime 数据。V1 类型和执行适配器在兼容期保留，读取时按 schema 分发，不把历史 JSON 原地归一化成 V2。

## Contracts

### Definition

```ts
type CanvasScheduleV2Definition = {
  parameters: CanvasBatchParameter[];
  expansion: {
    main: "cartesian" | "zip";
    child: "cartesian" | "zip";
  };
  childResult: {
    nodeId: string;
    outputPort: string;
    artifactKind: "text" | "images" | "videos";
  };
  mainTargetNodeId?: string;
  aggregationPolicy: "at-least-one" | "all";
};
```

`CanvasBatchParameter` 使用 PRD 中确认的 scope、类型、来源、展开方式和 `nodeId + fieldKey` 绑定。所有用户输入先经服务端 normalize/validate，再进入 schedule JSON。

随机展开使用通用数量契约：

```ts
type CanvasScheduleSampleCount =
  | { mode: "exact"; value: number }
  | { mode: "range"; min: number; max: number };
```

历史 `randomCount` 在读取草稿或旧预演时按 `{ mode: "exact", value: randomCount }` 解释；新保存的 V2 definition 只写 `sampleCount`，继续使用 `schemaVersion: 2`，不新增数据库迁移。已冻结或已启动记录不被后台重写。

节点注册表为可批量注入字段提供声明式元数据。通用标量直接写入配置；图片、图片组、素材库记录和文案记录通过服务端 adapter 生成与普通选择器一致的扁平冻结配置。注册表未声明的字段不出现在绑定 UI，也不接受 API 注入。

### Runtime

预演产生冻结的 `mainTasks[]`，每个主任务保存主参数 snapshot、`childTasks[]`、聚合状态和可选 `mainRunId`。每个子任务保存子参数 snapshot、Canvas `runId`、结果 artifact、错误和时间戳。ID 和预演指纹由 schedule/task identity 与规范化快照确定，保证恢复及重试可定位。

`CanvasRun.batchContext` 扩展为可区分 V1 与 V2 的上下文，V2 使用 `mainTaskId`、`childTaskId?` 和 `phase: "child" | "aggregate"`。终态 run 继续动态唤醒 scheduler，避免 scheduler/runs 静态循环依赖。

## Expansion and Data Flow

1. 解析每个参数来源为有序、owner 可访问的候选值列表，只负责权限、筛选、快照和去重所需的原始值，不提前抽样。
2. 调度展开层执行无放回抽样：主任务随机参数每次预演抽样一次；子任务随机参数为每个主任务重新独立抽样。区间数量在包含上下界的整数集合中等概率选择，最大值超过唯一候选数时失败。
3. 固定参数广播到所属层级；全量或随机逐项参数按该层的 `cartesian` 或 `zip` 展开。`cartesian` 为各随机参数独立选择数量；`zip` 将全量长度和精确数量视为单点区间，与所有范围求交集后共享一个数量，交集为空时失败。
4. 先展开主任务，再在每个主任务下独立展开子任务；没有逐项子参数时仍创建一个子任务。
5. 校验所有绑定、输出端口、路径、artifact 类型、目标能力、实际展开后的 2,000 子任务上限和模型调用估算。
6. 启动时为每个子任务克隆冻结图，依次应用主参数和子参数 adapter，运行到 `childResult.nodeId`。
7. 达到聚合策略后收集成功 artifact。没有主目标则直接完成主任务；有主目标则把冻结图中的 child-result 节点替换为对应的 literal input 节点，删除其入边并运行到主目标。

主目标必须位于 child-result 节点下游。聚合替换只支持 `text -> input.text`、`images -> input.images` 和 `videos -> input.videos`。主目标计划包含 `external_write` 时预演失败，确保 schedule 不自动发布。

## UI

节点检查器增加通用名称输入。名称更新走现有画布 autosave/undo 路径，选择器显示 `自定义名称 · 类型 · 短 ID`。

批量调度抽屉按执行节点、主任务参数、子任务参数和预演树组织。参数编辑器根据 value type 约束来源和可绑定字段；固定/全量逐项/随机逐项使用紧凑选择控件，随机模式提供“固定个数 / 随机范围”切换及对应整数输入，层级组合规则使用菜单。子任务范围摘要显示“每个主任务随机抽取 2-4 项”。预演树显示每个主任务实际子任务数、冻结值、预计调用数和具体校验错误。运行树沿用 schedule -> main -> child 层级及现有暂停、取消、重试和候选接受操作。

标准人物/场景/车辆角度配置作为可编辑预设创建 V2 definition，不向核心类型增加这些业务字段。

## Compatibility and Rollback

- 新建 schedule 为 V2；读取无 schemaVersion 的记录走 V1 adapter。
- V1 转换创建新的 V2 schedule，复制可表达的 scene、vehicle、copy、Switch 与目标设置，原 schedule 保持不变。
- 已启动 V1/V2 schedule 都不可编辑；duplicate 只复制 definition，不复制 runtime。
- JSONB/SQLite JSON 列已覆盖新结构，不增加 migration。回滚代码后 V1 仍可使用，V2 记录保留但旧版本不应尝试解释或执行。

## Risks

- 绑定任意字段会破坏节点配置不变量，因此必须使用注册表 allow-list 与 adapter，不能接受任意路径。
- 全量笛卡尔积可能迅速放大任务量；预演必须在创建 run 前执行上限和调用数检查。
- 聚合运行不得重新进入 child-result 上游，否则会重复付费；图替换与目标路径必须有确定性覆盖。
- 通用主目标不一定产生 social post，任务中心必须使用现有多 artifact viewer，而不是假定 generatedPostId 必然存在。
