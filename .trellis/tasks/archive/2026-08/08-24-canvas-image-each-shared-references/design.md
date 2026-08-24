# 技术设计

## Node Contract And Migration

新增 `model.gpt-image-each@2` 作为当前定义，保留 `@1` 在版本定义表中。V2 的 `images` 端口保留原 id 以维护现有连线，显示名改为“待重构图片组”；新增可选、多连线的 `references` 图片端口；`prompt` 契约不变。`upgradeCanvasNode` 将 V1 节点升级为 V2，只合并 V2 默认配置并保留已有配置；边无需改写。

## Execution And Recovery

执行器按节点版本解析共享参考图：V1 始终为空，V2 从 `inputs.references` 按 artifact 和 item 顺序展开、去空并稳定去重。共享参考图超过 15 张时，在任何 provider 调用前失败。

每个 child 构造 `requestReferences = [source.url, ...sharedReferences.filter(url !== source.url)]`，并调用现有 `generateCanvasGptImages(prompt, 1, requestReferences, ...)`。提示词不变。V2 输入指纹包含节点版本、有序原图、有序共享参考图、提示词和生成参数；只有整个指纹一致才允许继承 child 状态，因此参考图改变时会重新创建全部 children，同一输入的部分失败仍只重试失败项。

V1 元数据继续使用 schema 1；V2 写 schema 2，并增加 `sharedReferenceCount` 与 `referencesPerRequest`。读取类型兼容两种 schema。provider task id、route、status 仍保存在各 child 中；恢复时沿用原 inputs 和相同指纹，不重复提交已接受任务。

## UI And Scheduling

节点定义和描述展示新端口语义。运行详情在原进度行中增加“共享参考 N”和“每次输入 N”信息。没有共享参考图时显示 0 和 1。跳过定义仍从 `images` 透传到 `images`。

调度器不引入新角色或存储结构：现有场景/车型图片输入可由画布作者分别连到 `images` 和 `references`，旧 scheduler role 校验、图克隆和 V2 参数绑定继续沿用通用端口机制。V1 工作流自动升级后，新端口为空。

## Compatibility And Failure Modes

- 供应商总参考图上限仍由共享的 16 张校验兜底；节点提前把共享输入限制为 15 张。
- 重复共享 URL 只提交一次；与当前原图重复时当前原图保持首位。
- V1 运行快照仍通过 `@1` 定义验证和执行，不读取 V2 参考端口。
- 不新增数据库字段或运行表迁移；Canvas JSONB 继续容纳扩展后的 metadata。
- 回滚边界为恢复 V1 作为当前定义并移除 V2 升级分支，已保存 V2 工作流在回滚版本中将不可读，因此只在提交前回滚。
