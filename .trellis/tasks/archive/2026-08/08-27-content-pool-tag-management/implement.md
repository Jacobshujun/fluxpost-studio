# 内容池标签化管理与画布筛选：实施计划

## 1. 数据与领域规则

- [x] 在 `src/lib/types.ts` 增加可选自定义标签、筛选、建议和批量结果类型。
- [x] 新增纯标签规则模块，覆盖规范化、上限、变更和 AND 匹配。
- [x] 扩展内容池读取、单条更新、标签建议和批量部分成功更新，保持 owner scope 与单次写入。

## 2. API 与筛选契约

- [x] 新增 authenticated `/api/content-pool/tags` GET/POST。
- [x] 扩展 `/api/content-pool/selection` 和选择领域，支持 `customTag`、普通搜索命中标签及结果展示。
- [x] 扩展 Canvas schedule 过滤器规范化，兼容旧定义缺失字段。

## 3. 内容台交互

- [x] 新增共享自定义标签 picker，支持建议、创建、删除和键盘操作。
- [x] 内容池列表加入关键字、双层标签筛选、清除和卡片标签展示。
- [x] 内容详情加入独立自定义标签编辑。
- [x] 批量栏加入自定义标签添加/删除与部分成功反馈。

## 4. 无限画布交互

- [x] 内容池浏览器增加自定义标签建议筛选并展示自定义标签。
- [x] 验证普通内容池节点和 V2 内容池参数编辑器使用同一筛选组件与 URL 契约。

## 5. 验证与完成

- [x] 增加或更新内容标签、内容台和画布的确定性检查。
- [x] 运行聚焦检查、`npx --no-install tsc --noEmit`、`npm run lint`、`npm run build`。
- [x] 运行 `.trellis/spec/fluxpost/verification.md` 中的完整离线基线。
- [x] 用 mock 浏览器检查 1440x960 和 390x844 内容台/画布交互与溢出。
- [x] 更新 `status.md`、`feature_list.json` 和必要的稳定规范事实。
- [ ] 审查 diff 与敏感文件边界，提交实现并从 clean HEAD 启动端口 3001 候选。

## Rollback Points

- 领域/API 完成后先跑纯规则与现有内容池选择检查；失败时不进入 UI 修改。
- 内容台完成后先跑 content desk 与类型检查；失败时不进入画布修改。
- 画布完成后跑 canvas content-pool selection 检查，再进入全基线。
