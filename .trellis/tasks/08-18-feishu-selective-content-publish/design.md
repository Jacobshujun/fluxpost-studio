# 飞书内容分项写入技术设计

## Architecture

模式由一个共享、纯 TypeScript 契约统一定义：`full`（完整写入）、`text`（仅标题与正文）、`media`（仅图片与视频）。UI、API、简单任务、画布节点、队列和 CLI 均引用同一契约，不在各层自行解释字符串。

数据流：

```text
主页 / 审查台 / Canvas 节点
  -> API 或 Canvas executor 验证模式
  -> enqueueFeishuPublishJob 持久化模式与内容快照
  -> worker 按模式准备、逐条校验和修复
  -> publishPostsToFeishu 按模式创建/更新记录
  -> 队列结果与 UI 恢复展示同一模式
```

## Shared Contract

- 在共享模块中定义 `FeishuPublishMode`、三种选项/中文标签、类型守卫、缺失值兼容解析，以及 `includesText` / `includesMedia` 判断。
- 显式非法值不得静默回退；API 返回 400，Canvas 配置校验阻止执行。
- `FeishuPublishJob.publishMode` 为持久化任务属性。数据库读取旧 JSON payload 时将缺失模式归一化为 `full`，无需 schema migration。
- `SimpleRunInput.feishuPublishMode` 允许旧数据缺失，但新建任务会规范化并持久化明确值。

## Entry Points

### Main Workspace

- 保留现有“写入飞书”复选框，默认关闭。
- 开启后显示紧凑的三段模式选择，默认“完整写入”。
- `/api/simple/runs` 验证并保存模式；所有简单任务发布分支入队时透传该模式。

### Review Desk

- 单条与批量写入共用一个页面级模式选择，默认“完整写入”。
- `POST /api/publish/feishu` 接受 `{ postIds, publishMode }`，显式非法模式返回 400。
- 发布快照、轮询结果和恢复中的活动任务显示任务实际模式，不依赖当前选择器状态。

### Infinite Canvas

- 新增 `publish.feishu@2`，配置字段为三选一模式，默认 `full`。
- `upgradeCanvasNode` 将 v1 发布节点升级到 v2，并注入 `full`；端口不变，因此连线保持有效。
- executor 从节点配置解析模式后入队。非法配置在图校验阶段报错，执行边界再次防御性验证。

## Queue Semantics

- `enqueueFeishuPublishJob` 先规范化模式再保存。
- 活动任务去重键为 `ownerUserId + sorted(postIds) + publishMode`，相同内容的不同模式可分别排队。
- `full` 保持当前标签补全、车型选项校验和媒体引用修复。
- `text` 要求每条内容的标题与正文均非空，跳过标签补全、车型校验、媒体修复和媒体准备。
- `media` 要求每条内容至少有一张图片或一个视频，跳过标签补全、车型校验和文本字段准备，只修复并准备媒体。
- 无效内容形成现有 `validation` item failure；有效兄弟继续，全部无效则在任何外部写入前失败。

## Feishu CLI Writes

- `full`：保留全部非附件字段写入、回读验证与附件上传。
- `text`：记录创建/更新 payload 只含标题和正文；仅回读这两个字段；不解析或上传附件。
- `media`：已有 record id 时直接上传附件；没有 record id 时创建空字段记录取得 id，再上传附件。不得构造文本或元数据 patch。
- staged payload 和 record payload 只暴露所选类别；向自定义 CLI 参数提供模式环境变量。完整模式保持既有 payload 兼容。
- 模式感知的发布状态更新只修改本次实际处理的状态：文本模式保留既有附件状态，媒体模式保留既有文本字段验证状态。
- 一条内容在所选模式下成功的判断：`text` 需要文本字段验证成功；`media` 需要 record id 和附件上传成功；`full` 保持现有文本与附件组合判断。

## Compatibility And Persistence

- 旧 API 调用、旧简单任务、旧队列 JSON、旧画布节点均默认完整写入。
- 不增加数据库列或迁移；模式随 `data_json` 保存，数据库反序列化时补齐旧值。
- 完整模式的字段映射、批次大小、owner 隔离、通知、失败隔离和显式重试策略不变。

## UI Design

- 主页和审查台使用共享样式的三段选择器，稳定高度、可换行标签和明确的 `aria-pressed` 状态。
- Canvas 复用现有节点 inspector 的 select 字段控件。
- 发布状态文案包含模式标签；媒体数量只在实际包含媒体的模式中计入描述。
- 移动端选择器不得挤压发布按钮或产生文本重叠。

## Verification

- 新增离线 `feishu_publish_mode_check.mjs`，执行纯模式契约与字段投影，静态核对三条入口和队列/CLI wiring，不调用飞书。
- 扩展现有队列、简单任务、审查台与 Canvas 检查，覆盖默认兼容、非法模式、去重维度、v1->v2 升级和 UI 请求字段。
- 运行 TypeScript、lint、build 与 `.trellis/verification/check.ps1` 全基线。
- 使用端口 3001 的 `npm run dev` 做未提交页面预览和 Playwright 桌面/移动截图；不启动后台 worker，不提交真实飞书任务。

## Rollback

- 回滚共享模式字段、三个入口控件和模式分支即可恢复完整写入单一路径。
- 因无 schema migration，回滚不会需要数据库降级；已保存的新任务 JSON 中的额外字段会被旧代码忽略。
