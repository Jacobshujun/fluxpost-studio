# Design: Canvas 连线、媒体与原生缩放回归修复

## Boundary

改动保持在 Canvas 客户端显示层：`src/app/canvas/page.tsx`、`src/app/globals.css`、现有 Canvas 确定性契约，以及任务内的模拟浏览器检查。不会改变 Canvas API、持久化图结构、运行/调度逻辑、媒体存储、外部 provider 或生产部署。

## Root Causes

1. `FlowingCanvasEdge` 只在 `selected || data.beamActive` 时挂载两条流光路径，因此普通未选中边被阶段 1 明确降为静态单路径。
2. React Flow 的 `.react-flow__edge.selected .react-flow__edge-path` 使用 `--xy-edge-stroke-selected`，覆盖自定义基础路径颜色并回落到默认灰色。
3. `.canvas-stage-viewport-moving` 对 `.canvas-node-image-grid` 和 `.canvas-node-result` 设置 `visibility: hidden`，所以媒体 DOM 未卸载、资源也未重取，但视觉上会在缩放期间消失。
4. 用户试用后明确撤销自定义缓入缓出方案，要求恢复此前的 React Flow 原生缩放路径。

## Edge Rendering

- 每条当前可见业务边继续只有一条连续基础路径，同时始终挂载现有 glow/highlight 流光路径。
- 普通边使用轻量流光；选中边或连接 `queued` / `running` 节点的边增加强调 class 和现有滤镜/线宽。viewport 移动时仍暂停所有流光动画与滤镜，保留阶段 1 的交互期降载。
- `toFlowEdges` 从同一节点定义颜色同时设置 `--canvas-edge-color` 与 React Flow 的 `--xy-edge-stroke-selected`，避免选中规则回落为灰色。
- `prefers-reduced-motion` 下隐藏流光路径，仅保留更清晰的静态业务色基础线。

## Media Visibility

- 从 `.canvas-stage-viewport-moving` 规则中移除 `.canvas-node-image-grid` 与 `.canvas-node-result`，媒体在同一 detail tier 内随 viewport 合成层持续缩放。
- 继续在移动时隐藏模式菜单、resize 控件和 MiniMap，并移除节点 shadow/filter；继续保留现有 `reduced` / `overview` 静止 LOD 边界。
- 不增加占位图、条件渲染、媒体 key 变化、延迟恢复或资源重请求。

## Native Zoom

- 恢复 React Flow 的默认滚轮/触控板缩放与内置 `Controls showInteractive={false}`，保留原有 `minZoom={0.2}`。
- 删除 route-local easing、duration、wheel 目标 viewport 计算、动画 refs/timer、`zoomOnScroll={false}` 和专用 Controls。
- `onMove` 继续只同步 DOM detail tier；原始 `onMoveStart` / `onMoveEnd` 继续管理移动 class、viewport React state 与 dirty/autosave。
- 触屏双指、滚轮、触控板与 Controls 全部由 React Flow 的同一原生交互系统处理。

## Compatibility And Rollback

- 节点尺寸、handle 坐标、选择、连接、MiniMap 存在性与持久化 `CanvasGraph` 不变。
- 滚轮缩放恢复此前的 `minZoom=0.2` 与 React Flow 默认上限/指针中心；editable/`nowheel` 控件继续隔离画布手势。
- edge eligibility 与 moving-media selector 可分别回滚；缩放已恢复原生实现，没有数据迁移或图修复。
