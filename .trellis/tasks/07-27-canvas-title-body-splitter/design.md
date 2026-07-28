# Canvas 文本分割节点设计

## Contracts

保留 `utility.text-split@1`，新增同类型 V2 并作为最新定义。V2 继续使用 `text` 输入和 `head`/`tail` 输出 ID，仅把展示标签改为“标题”“正文”。配置保持平坦标量：`mode`、`delimiter`、`delimiterIndex`。现有 `CanvasNode.version` 已支持 V2，无 API 或数据库迁移。

## Execution

共享纯函数负责规范化输入、按模式定位边界和构造结果。V1 调用严格策略：找不到边界或空侧时抛错。V2 调用正文降级策略：完整原文写入 `tail`，省略 `head`。第 N 个分隔符从左至右按 `delimiter.length` 推进，避免重叠匹配；空输入始终失败。

节点执行器根据快照中的 `node.version` 选择策略，因此旧运行快照不会被 V2 降级语义改写。编辑图保存/复制时，`upgradeCanvasNode` 合并 V2 默认配置并补入 `delimiterIndex: 1`，端口 ID 不变，已有边无需调整。

## UI

V2 节点内容区渲染紧凑配置控件，遵循 React Flow 的 `nodrag nopan nowheel` 和事件隔离规则；属性面板继续由注册字段渲染，并在第一行模式隐藏 `delimiter`/`delimiterIndex`。专用结果组件按输出 ID 展示两个文本区域，分别复用现有完整文本预览弹窗；缺少 `head` 且存在 `tail` 时展示降级状态。

## Compatibility And Rollback

V1/V2 定义同时保留，剪贴板与图校验继续按具体版本查注册表。回滚可移除 V2 最新映射、升级分支和专用 UI；无数据库回滚和媒体清理。

## Safety

分隔符是普通文本，不解释为正则或代码。验证拒绝空分隔符以及非正整数序号。所有验证使用本地确定性输入，不调用模型、Seedance 或 Feishu。
