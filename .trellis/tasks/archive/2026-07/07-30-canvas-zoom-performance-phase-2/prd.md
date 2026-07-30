# 无限画布缩放第二阶段优化

## Goal

在第一阶段完成离屏裁剪和连线降载后，继续降低大型工作流在全图视图、低缩放级别和连续缩放/平移期间的节点绘制与合成成本，同时保持节点几何、选择、编辑、连线和持久化行为不变。

## Background

- 第一阶段已启用 React Flow `onlyRenderVisibleElements`，将空闲边降为单路径，并在 viewport 移动期间暂停边流光和 SVG 滤镜。
- `@xyflow/react@12.11.2` 的 `NodeRenderer` 已只订阅节点 ID 并使用 `memo`；viewport 逐帧变化由 React Flow 内部 transform 处理，当前页面只在 `onMoveEnd` 保存 viewport。因此本阶段不重复增加组件 memo 化或按帧 React state。
- `CanvasFlowNode` 的可见节点可能包含多张 `next/image` 图片、结果图库、视频、文本结果、阴影、滤镜和交互控件，这些内容会随统一 viewport transform 参与绘制或合成。
- 全模拟 Chromium 基线中，80 节点在普通 1x viewport 只渲染 4 个节点，但 MiniMap 始终保留 80 个节点；Fit View 后 80 个节点全部可见。连续 24 次滚轮缩放的主线程任务时间为 180.42 ms。真实大图和高分辨率媒体的绘制成本仍可能更高。
- 当前工作树包含其他 Canvas 调度任务的未提交修改；本任务只能做局部改动并保留并行工作。

## Requirements

- R1：根据 React Flow 实际 zoom 设置仅用于显示的 viewport detail tier：`full`、`reduced`、`overview`。tier 必须直接同步到 Canvas stage DOM，只有跨越阈值时才写 DOM，不得按帧写 React state。
- R2：`full` tier 保持现有节点内容；`reduced` tier 对未选中节点停止绘制图片网格、结果预览和视频等富媒体；`overview` tier 对未选中节点进一步停止绘制节点内容和不可读的文字 chrome，同时保留节点几何、颜色识别、端口/连线定位和选择能力。
- R3：任何 viewport 缩放或平移期间，对所有节点暂停富媒体与结果内容绘制，移除节点阴影/滤镜，并暂停 MiniMap 绘制；viewport 静止后按当前 tier 恢复。选中节点只能在静止的 `reduced` / `overview` tier 保留完整内容，移动期间同样降载。
- R4：detail tier 切换不得改变 React Flow 节点测量尺寸、持久化的 `CanvasGraph`、viewport 保存节奏、节点配置、运行状态、历史记录或移动端编辑权限。
- R5：保持第一阶段的可见元素裁剪、活动边流光、移动期边动画暂停和 `prefers-reduced-motion` 行为。
- R6：不得修改 Canvas API、数据库、调度器、提供商调用或生产部署。

## Acceptance Criteria

- [x] AC1：纯函数根据 zoom 返回稳定的 `full` / `reduced` / `overview` tier，DOM 同步函数在 tier 未变化时不修改 stage 属性。
- [x] AC2：模拟浏览器在正常 zoom 下显示完整节点内容；静止的 `reduced` / `overview` tier 分别执行对应降载，且选中节点保持完整内容。
- [x] AC3：连续缩放/平移期间，节点富媒体、结果内容、节点阴影/滤镜和 MiniMap 均停止绘制；结束后按当前 tier 恢复。
- [x] AC4：detail tier 和移动 class 切换前后节点边界尺寸不变，选择、端口、连线和 viewport 保存仍可用，保存的图数据不包含显示 tier。
- [x] AC5：大图模拟检查覆盖至少 80 个节点、Fit View、tier 跨越、同 tier 幂等 DOM 更新和控制台错误；不得调用外部服务或真实运行数据。
- [x] AC6：Canvas 确定性检查、TypeScript、变更文件 lint、生产构建、本地重启与 HTTP smoke 通过；完整 Trellis 基线必须尝试，若仍受已知仓库问题阻塞则明确记录。

## Out Of Scope

- 替换 React Flow、改用 Canvas/WebGL 或重写滚轮插值曲线。
- 卸载/重建节点 DOM、改变节点尺寸或基于 zoom 持久化另一套图数据。
- 图片格式转换、缩略图服务、媒体懒加载策略或 MiniMap 架构替换。
- 生产环境部署和真实运营工作流性能压测。
