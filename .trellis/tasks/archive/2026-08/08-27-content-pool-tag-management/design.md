# 内容池标签化管理与画布筛选：技术设计

## Architecture

本功能保持内容池现有边界：`src/lib/content-pool.ts` 继续拥有 owner-scoped 读取和整池写入，新增纯标签规则模块负责规范化、比较和变更计算。UI 不复用图库资产领域，只复用其交互原则。

## Data Contract

- `NormalizedSourceItem.customTags?: string[]` 保存人工自定义标签；旧记录缺失时等价于 `[]`。
- `contentTagging.tags` 继续只保存 `ContentTag[]` 固定分类，AI 与人工单条修正行为不变。
- `ContentPoolSelectionFilter` 新增 `customTags: string[]`。
- `ContentPoolSelectionItem` 新增 `customTags: string[]`，用于画布结果卡片展示；执行快照不增加该字段，因为标签不参与节点执行内容。
- 每条最多 20 个自定义标签，每个最多 40 字符；规范化键使用 NFKC、压缩空白、trim 和 locale lowercase。

## Domain And API

- 新增 `src/lib/content-pool-tags.ts`：常量、规范化、AND 匹配、单条 add/remove 计算。
- `src/lib/content-pool.ts` 新增 owner-scoped 标签建议和批量标签更新；一次读取、一次整池写入，避免逐条全量写造成额外冲突。
- 新增 `GET /api/content-pool/tags?q=&limit=`：返回 `{ tags: [{ label, count }] }`。
- 新增 `POST /api/content-pool/tags`：接收 `{ ids, add?, remove? }`，返回 `{ items, failures }`。每条独立校验，超限或不可编辑条目进入 failures，其余成功；没有成功项时不写库。
- 现有 `PATCH /api/content/items` 接受 `customTags`，由领域层统一规范化，防止绕过 UI 限制。
- 选择 API 新增重复 `customTag` 查询参数；固定 `contentTag` 与自定义 `customTag` 均为 AND，两个维度也同时满足。

## UI Flow

- 新增共享客户端组件 `src/components/content-pool-custom-tag-picker.tsx`，提供标签 chip、建议计数、键盘操作、可选自由创建和错误状态。
- 内容台列表增加关键字、内容分类、自定义标签筛选和统一清除；卡片分别展示固定分类与自定义标签。
- 内容详情把固定分类保留为现有 chip 选择，并新增独立的“自定义标签”选择器。
- 内容池批量栏增加“管理标签”，打开轻量内联面板，在“批量添加/批量删除”之间切换并显示部分成功摘要。
- 无限画布 `ContentPoolSelectionBrowser` 在高级筛选中保留固定分类 checks，并增加共享自定义标签选择器；普通节点和 V2 参数编辑器因共用浏览器而同步生效。
- 视觉沿用内容台与画布现有暗色、紧凑、低圆角工具界面；不新增页面、卡片嵌套或说明型大段文案。

## Compatibility

- 所有读取都通过 `item.customTags || []`；旧内容和旧画布 schedule 无需数据迁移。
- `normalizeContentPoolSelectionFilter` 为缺失 `customTags` 补空数组，旧保存图和批次定义可继续打开。
- 冻结快照、状态流转、AI 重新打标、生产和发布均不读取或改写自定义标签。
- 标签建议遵循现有内容池 owner 可见性；普通成员看不到其他 owner 标签，管理员维持现有全局访问规则。

## Risks And Rollback

- 内容项目是 JSON 整行存储，批量更新必须只写一次并沿用现有 owner 检查；不引入并行逐条写。
- 共享 picker 的网络请求使用 AbortController 和短防抖，不使用轮询或静默失败。
- 回滚只需移除可选字段消费、标签 API 与 UI；已写入 JSON 的 `customTags` 会被旧代码忽略，不破坏旧版本读取。

## Verification

- 纯规则：规范化、大小写去重、40 字限制、20 标签上限、add/remove、AND 匹配。
- 领域/API 静态与隔离检查：owner scope、部分成功、一次写入、旧字段兼容、建议计数排序。
- 内容台检查：搜索命中标签、双层筛选、单条编辑、批量面板与结果提示。
- 画布检查：`customTag` 查询、保存过滤器兼容、普通节点与 V2 共用浏览器。
- TypeScript、ESLint、production build、Trellis 全基线。
- Mock 浏览器在 1440x960 和 390x844 验证内容台与画布，无外部服务调用。
