# 无限画布缩放第三阶段优化

## Goal

在前两阶段完成离屏裁剪、连线降载和显示细节分级后，继续消除大型工作流缩放时由富媒体 DOM、viewport 订阅组件和媒体恢复造成的卡顿，同时保持 React Flow 原生手势语义、节点几何和画布数据不变。

## Background

- 第一阶段已经启用 `onlyRenderVisibleElements`，将空闲边降为单路径，并在 viewport 移动期间暂停流光与 SVG 滤镜。
- 第二阶段已经增加 DOM-only `full` / `reduced` / `overview` 细节档位；低倍缩放和移动时使用 CSS 隐藏富媒体、结果、阴影、控件与 MiniMap，但隐藏的 React 子树仍然挂载。
- `@xyflow/react@12.11.2` 使用其内置 D3 pan/zoom 处理滚轮和触控板输入；当前页面没有自定义缩放曲线，也没有在 `onMove` 中逐帧写 React viewport state。
- `CanvasFlowNode` 最多挂载四张未优化原图、结果图集或视频。CSS `visibility: hidden` 停止绘制，但不会取消组件订阅、DOM 维护、资源下载或媒体解码。
- React Flow 的 `Background` 与 `MiniMap` 位于主 viewport 之外并订阅 transform；第二阶段只隐藏 MiniMap 绘制，没有停止其 viewport 计算。
- 真实运营大图的帧时间仍待确认。现有 80 节点模拟验证证明 DOM/绘制降载生效，但不能单独证明所有输入设备上的帧稳定性。
- 当前工作树包含其他 Canvas 调度任务的未提交修改；本阶段必须隔离补丁，不能覆盖或整文件暂存并行工作。

## Requirements

- R1：建立可重复的第三阶段浏览器基线，至少覆盖 80 节点 Fit View、连续滚轮缩放、DOM/媒体数量、viewport 更新次数、长任务或帧间隔，以及控制台错误；比较必须使用相同 fixture 和输入序列。
- R2：保留 React Flow 原生鼠标滚轮、触控板、双指缩放、缩放中心、最小/最大 zoom 和 `onMoveEnd` viewport 保存语义，不手写新的 pan/zoom 物理引擎。
- R3：第三阶段只针对前两阶段后仍存在的 transform 合成成本：为 React Flow 主 viewport 建立稳定的合成提示，使连续 transform 更新可由浏览器合成路径处理；不得恢复已被关闭的流光、滤镜、阴影或离屏节点渲染。
- R4：任何富媒体降载都必须保留节点外框尺寸、端口坐标、选中与连接能力；当前选中且 viewport 静止的节点必须能显示完整内容。
- R5：不得修改 Canvas API、数据库、调度器、provider、持久化 `CanvasGraph` 或移动端编辑权限。
- R6：默认验证不得调用付费 provider、Feishu、生产环境或真实运行数据。
- R7：节点媒体必须在缩放全过程保持原 DOM 与资源生命周期；不得用占位替换、卸载/重挂载、延迟恢复或重新解码来换取帧率，也不得引入停止缩放后的闪现。

## Acceptance Criteria

- [x] AC1：浏览器检查记录同一 80 节点 fixture 的帧/长任务、viewport transform、DOM/媒体和 CDP LayerTree 证据；主 viewport 必须拥有由 `will-change: transform` 建立的稳定合成层，且改动不增加逐帧 React 页面状态更新。
- [x] AC2：连续缩放期间继续沿用第二阶段 detail/moving 降载；第三阶段不得新增媒体隐藏、占位、卸载或恢复分支。
- [x] AC3：降载前后抽样节点的宽高与端口位置不变；选择、连接、Fit View、Controls、MiniMap 和 viewport 保存继续可用。
- [x] AC4：缩放中心、滚轮方向、zoom 边界和触控板/双指入口继续由 React Flow 原生实现，且没有控制台错误或 hydration 错误。
- [x] AC5：浏览器检查证明缩放前后媒体元素保持同一 DOM identity，资源请求不因缩放重复发生，且停止缩放后没有占位切换或媒体恢复闪现。
- [x] AC6：Canvas 确定性检查、TypeScript、变更文件 lint、生产构建、本地重启、HTTP smoke 和任务级浏览器检查通过；完整 Trellis baseline 必须尝试并如实记录既有阻塞。

## Out Of Scope

- 替换 React Flow，或自研滚轮、触控板、惯性与双指缩放算法。
- Canvas/WebGL 重写、服务端缩略图流水线、历史媒体批量转换或 TOS 数据迁移。
- 缩放期间以占位、卸载、重挂载或延迟恢复富媒体内容。
- 修改节点业务能力、调度、运行状态、API、数据库或生产部署。
- 未经同一 fixture 基线证明就调整缩放速度、曲线或输入增益。
