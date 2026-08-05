# Technical Design

## Contracts

`CanvasScheduleV2Definition` 增加可选 `sharedOutputs` 数组，每项保存 `nodeId`、`outputPort` 与 `artifactKind`。读取旧 definition 时归一化为空数组。`CanvasScheduleV2MainTask` 增加可选 shared run id、状态、冻结 artifact 列表和错误；V2 `batchContext.phase` 增加 `shared`。

共享 artifact 记录同时保存原节点/端口标识和完整 artifact。definition 与 runtime 字段均保存在现有 schedule JSON，不迁移数据库。

## Validation

共享节点注册表定义必须是非 input、非 passive sink、非 `external_write`，并且恰好有一个 `text/images/videos` 输出。共享节点必须严格可达子任务结果节点，选择不得重复。对每个共享节点收集其祖先闭包，若任何 child-scope 参数绑定落在闭包内则拒绝预演。

## Runtime Data Flow

1. 预演展开主/子参数并分别验证 shared graph、child graph 和 aggregate graph。
2. 无共享输出时沿用现有 launch 路径。
3. 有共享输出时，launch 为每个主任务应用主参数，创建一个以所有共享节点为目标的 shared run；子任务参数快照已冻结，但 child run 尚未入队。
4. scheduler reconcile 读取 shared run。成功后提取所有配置端口 artifact，保存到主任务，并为每个子任务应用主+子参数，再把共享节点替换为对应 literal input、删除入边并重连出边端口。
5. 使用新的数据库事务 helper 更新 schedule revision，同时原子插入并入队该主任务的全部 child runs。确定性 run id 保证重启/竞争时幂等。
6. 所有 child 终态后继续使用现有聚合逻辑；aggregate graph 不重新进入 child-result 上游。

## Lifecycle

- shared run 失败或 partial 时主任务进入失败状态，子任务保持未启动；`retry-shared` 找到首个失败节点并复用现有 node retry。
- shared 成功结果不可重跑。child retry 操作使用已经 literal 化的冻结 graph。
- pause/defer、resume、cancel 与 schedule run-id 枚举包含 `sharedRunId`。
- 无共享定义和历史运行字段缺失时使用当前状态机，不做后台重写。

## UI And API

V2 编辑器在执行节点区展示可共享节点复选列表，支持多个选择并标注每个主任务执行一次。预演与运行树展示 shared stage；运行失败时调用 schedules API 的 `retry-shared` action，payload 为 `mainTaskId`。

## Rollback

所有新增 definition/runtime 字段均可选。回滚 UI、scheduler shared 分支和类型后，未配置共享的 V2 与 V1 路径仍保持原数据契约；无需数据库回滚。
