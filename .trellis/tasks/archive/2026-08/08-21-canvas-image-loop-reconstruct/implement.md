# 实施计划

## Phase 1: Contracts

1. [x] 定义独立节点 type/version、输入输出端口、默认配置、18 张上限和 1..20 并发校验。
2. [x] 定义逐图 child 状态、聚合状态、失败报告和原始索引元数据。
3. [x] 明确普通 Canvas run 与 V2 schedule child-task 共用的 fan-out/aggregate 服务边界。

## Phase 2: Execution

1. [x] 实现 preflight：空输入、超限、prompt、重复运行和配置错误检查。
2. [x] 实现图片组展开、稳定 child identity、输入快照和按配置并发调度。
3. [x] 接入 GPT-Image-2 单图请求，固定 `count=1`，复用 provider task resume 和全局并发池。
4. [x] 实现成功/失败/pending/needs_config 状态持久化、worker 重启恢复和幂等 reconcile。

## Phase 3: Aggregation And Review

1. [x] 按原始索引聚合成功图片，不创建失败占位。
2. [x] 生成 `report` 文本和结构化失败清单。
3. [x] 将部分成功结果交给 `compose.social-post`，标记草稿为部分完成并禁止自动发布。
4. [x] 实现失败 child 单独重试，成功后更新原评审草稿而不是新建草稿。

## Phase 4: UI And Schedule Integration

1. [x] 增加节点编辑面板、预检摘要、并发控制和 18 张上限提示。
2. [x] 增加运行详情、逐图状态、错误展示、provider pending 状态和单图重试操作。
3. [x] 让 V2 schedule 复用同一展开/聚合内核，保持现有 child/main 聚合契约。

## Verification

1. [x] 新增 focused contract checks：单图提交、顺序聚合、18 张上限、并发边界、部分失败、report、重试、幂等和 provider resume。
2. [x] 使用 mock provider 验证普通 Canvas 和 V2 schedule，不调用真实外部服务。
3. [x] 运行 `npx --no-install tsc --noEmit`、`npm run lint`、`npm run build`。
4. [x] 运行 `$env:TRELLIS_SMOKE_PORT='45678'; powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`。

## Risk And Rollback

- 优先新增模块和独立节点版本，避免改变旧 GPT-Image-2、compose 或现有 schedule 语义。
- 若普通 Canvas 的持久化 child 机制与现有 run schema 冲突，先抽取共享 fan-out 服务并保留 schedule 适配层，不在 executor 中加入隐藏循环。
- 任何 provider resume、聚合幂等或草稿写回回归都阻断发布候选，保留旧节点路径作为回滚边界。
