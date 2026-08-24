# 实施计划

## Contracts

1. [x] 扩展 Canvas image-each 元数据类型，使 V1/V2 schema 可区分并记录共享参考计数。
2. [x] 保留 V1 定义，新增 V2 三端口定义并实现 V1 到 V2 的无损节点升级。
3. [x] 确认图序列化、图校验、跳过模式及调度绑定通过通用端口契约工作。

## Execution

1. [x] 在逐图执行器中解析、稳定去重并校验 V2 共享参考图。
2. [x] 为每个 child 构造原图优先的有序参考数组，保持提示词和 `count=1` 不变。
3. [x] 将节点版本与共享参考图纳入输入指纹，保持部分重试和 provider resume 幂等。
4. [x] 为 V2 写入共享参考计数，同时保持 V1 元数据和历史运行兼容。

## UI And Verification

1. [x] 更新节点说明和运行详情计数，不增加节点内上传控件。
2. [x] 扩展 `canvas_image_each_check.mjs`，覆盖请求顺序、去重、边界、指纹失效、恢复、迁移、跳过和调度兼容。
3. [x] 运行 focused check、`npx --no-install tsc --noEmit`、`npm run lint`、`npm run build` 和完整离线 baseline。
4. [x] 更新 FluxPost status/feature evidence，完成 Trellis 检查并提交。
5. [x] 在干净提交上运行 `npm run local`，确认端口 3001 候选身份及 `/canvas` HTTP 状态；不调用真实 provider。
