# Canvas 逐图 GPT 重构节点

## Goal

在无限画布中，将“内容池素材”节点的一组图片自动拆成逐图任务，每张原图单独调用一次 GPT-Image-2 重构，最后将成功结果与原内容池的标题、正文合并为一条可进入评审页面的图文草稿。

## Confirmed Facts

- `input.content-pool` 当前把快照中的全部图片作为一个 `images` artifact 输出，见 `src/lib/canvas/executors.ts:113-125`。
- GPT-Image-2 V2 当前会合并上游所有图片引用并在一次调用中提交，最多 16 张，见 `src/lib/canvas/executors.ts:279-333`。
- `utility.image-select` 可以按从 1 开始的索引选择图片，但目前需要手工复制多个分支，见 `src/lib/canvas/registry.ts:405-417`。
- `compose.social-post` 支持多路图片输入并输出 `socialPost`，见 `src/lib/canvas/registry.ts:492-508`。
- Canvas 已有持久化 run、node run、后台 worker、provider task resume，以及 V2 schedule 的 child task/aggregate 机制；默认基线禁止真实 GPT-Image-2 调用。

## Requirements

- 新节点接收一个图片组输入，并按图片顺序生成独立的逐图重构任务。
- 每个逐图任务只向 GPT-Image-2 传入一张参考图；同一组提示词、比例、分辨率、质量、输出格式等配置一致应用。
- 节点将逐图结果按原始顺序聚合为一个图片组输出，供 `compose.social-post` 使用。
- 节点支持任务级状态、失败可见性和单图重试，不得因一张失败而静默丢弃整组结果。
- 节点有明确的最大图片数、并发/串行策略和空输入行为，不能依赖隐式无限循环。
- 与现有 GPT-Image-2 V2、内容组装节点、Canvas 持久化和评审草稿契约兼容；旧工作流继续可读可运行。
- 默认离线验证不得调用真实 GPT-Image-2、外部图片服务或 Feishu。

## Product Decisions

- 执行语义：复用 Canvas V2 的持久化 child-task/aggregate 模型。
- 入口：作为普通 Canvas 一等节点直接运行；V2 批次调度器复用同一 fan-out/aggregate 内核。
- 提示词：第一版使用一套共享重构提示词；每个子任务只替换单张参考图，不支持动态模板。
- 并发：默认 8，可配置范围 1..20；1 表示严格串行，实际运行仍受全局 worker、共享图片池和 provider 限流约束。
- 容量：单次最多处理 18 张；超限在预检阶段明确阻断，不静默截断。
- 聚合：采用 `at-least-one`。只要有成功图片就允许生成部分评审草稿；草稿标记为“部分完成”，禁止自动发布。
- 失败：不生成失败占位图；`images` 只包含成功图片并按原始序号排序，失败原始序号和原因进入结构化状态及 `report` 文本端口。
- 重试：只重试失败子任务；成功后更新原有评审草稿，保留草稿 ID 和重试历史。
- 输出：`images` 成功图片组；`report` 逐图处理摘要；结构化逐图状态、错误、provider task id 和重试次数保存在运行元数据中。

## Acceptance Criteria

- [ ] 一个包含 N 张图片的内容池输入可展开为 N 个可观测的逐图任务，每个任务只提交一张参考图。
- [ ] 所有成功结果按输入顺序聚合；全成功时可直接连接内容组装并生成一条评审草稿。
- [ ] 部分失败时保留成功图片、明确标记失败图片和错误原因，并支持只重试失败图片。
- [ ] 节点重启或 provider 异步任务 pending 后，可恢复原任务而不重复提交已接受的付费生成。
- [ ] 超过 18 张、空图片组、缺少提示词、重复运行和版本不兼容均有可见且可测试的错误或状态。
- [ ] 重试成功后更新同一评审草稿，不产生重复草稿。
- [ ] `report` 可被下游文本节点或预览节点消费，且不影响 `images` 到内容组装的主流程。
- [ ] 新增 focused checks、TypeScript、lint、build 和完整离线 baseline 均通过，且不产生真实外部调用。
