# 技术设计

## Architecture

新增独立版本的“逐图 GPT 重构”Canvas 节点。节点本身声明图片组输入、共享 prompt、GPT-Image-2 参数和并发上限；执行层统一使用持久化 fan-out/aggregate 内核。

普通 Canvas 运行和 V2 批次调度都调用同一内核：普通运行由节点创建一个持久化子任务集合，V2 schedule 将其作为 child-task 阶段嵌入现有 main/child 生命周期。不得在普通 node executor 内部隐藏一个不可观测的长循环。

## Data Flow

1. 上游 `input.content-pool` 输出图片组 artifact、标题和正文。
2. 节点 preflight 校验图片组非空、数量不超过 18、共享 prompt 非空、并发在 1..20。
3. 节点为每张输入图片创建稳定的 child identity：run id、原始索引、图片 URL 指纹和 prompt/config 指纹。
4. 每个 child 只向 GPT-Image-2 传入一张参考图，并固定 `count=1`。child 保存输入快照、provider task id/route/status 和每次 attempt。
5. 调度器按配置并发运行 child；实际 provider 调用继续复用全局 Canvas/image concurrency pool。
6. child 完成后产生带原始索引的单图 artifact；聚合器按索引排序，只收集成功图片，并生成结构化失败清单和 `report` 文本。
7. 下游 `compose.social-post` 使用 `images`、内容池标题和正文创建或更新同一评审草稿。

## Persistence And Recovery

- child 状态至少包括 queued、running、pending、completed、failed、needs_config、cancelled。
- provider 已接受的异步任务必须沿用现有 `providerTaskId/providerTaskRoute/providerStatus` 恢复契约；恢复时只查询原任务，不重新提交。
- 聚合状态为 completed、partial 或 failed。`at-least-one` 只允许有至少一张成功图时生成草稿；零成功时不生成新的可审核草稿并保留失败报告。
- 重试只创建失败 child 的新 attempt，成功后更新原聚合和原评审草稿 ID，不复制草稿。
- 聚合和草稿写回必须幂等，重复唤醒、重复 reconcile 或 worker 重启不能重复追加图片。

## Node Contract

- Inputs: `images` (required, multiple), `prompt` (required text).
- Config: ratio, resolution, quality, outputFormat, outputCompression, `concurrency` (default 8, 1..20), `maxImages` fixed at 18 for V1.
- Outputs: `images` (successful ordered group), `report` (summary text).
- Runtime metadata: total, succeeded, failed, pending, original index, source URL fingerprint, child id, attempt, provider state and error.

## UI And Review

- 节点面板展示输入数量、预检结果、并发、成功/失败/进行中计数和失败序号。
- 运行详情展示每张图的状态、错误和 provider task 状态；失败项提供单图重试。
- 内容组装/评审草稿显示“部分完成”标记和失败摘要；部分完成禁止自动发布。

## Compatibility And Limits

- 现有 `model.gpt-image@2` 继续保留“多参考图一次提交”语义，不修改旧节点行为。
- 旧工作流 JSON 保持可读；新增节点使用独立 type/version 和升级路径。
- V1 不支持按图片序号或内容池文本动态生成 prompt，不支持静默截断、不支持失败占位图。
- 默认验证使用 mock provider/static request-shape checks，禁止真实 GPT-Image-2、Feishu 或其他付费服务调用。
