# 无限画布缩放第一阶段优化

## Goal

降低大型无限画布在鼠标滚轮缩放和画布平移时的渲染与合成负载，使交互更连贯，同时保持现有工作流编辑、节点状态展示和持久化行为不变。

## Background

- `src/app/canvas/page.tsx:1096` 使用 `@xyflow/react` 渲染画布，但当前没有开启 `onlyRenderVisibleElements`，该依赖的默认值为 `false`。
- `src/app/canvas/page.tsx:1485` 为每条连线渲染一条基础路径和两条流光路径。
- `src/app/globals.css:215` 为两条流光路径持续执行虚线位移、模糊和阴影动画，所有连线无论是否选中或参与运行都会产生该负载。
- viewport 仅在 `src/app/canvas/page.tsx:1113` 的 `onMoveEnd` 中写入 React 状态；本阶段不重写 React Flow 的原生滚轮或双指缩放算法。
- `src/app/canvas/page.tsx` 和 `src/app/globals.css` 已包含其他任务的未提交修改，本任务只能增加局部改动并保留现有内容。

## Requirements

- R1：为 React Flow 开启官方可见元素裁剪，使完全离开当前 viewport 的节点和连线不再保持完整渲染。
- R2：默认连线只显示单条静态基础路径；流光只允许出现在用户选中的连线，或端点节点处于 `queued` / `running` 状态的连线上。
- R3：React Flow 触发 viewport 移动开始时，立即停止并移除所有流光路径的动画与滤镜；移动结束后，仅恢复符合 R2 的流光。
- R4：viewport 移动状态不得按帧写入 React state，不得改变已保存的 viewport、自动保存节奏、节点/连线数据或运行状态。
- R5：保持 `prefers-reduced-motion` 行为；启用减少动态效果时不得显示流光。
- R6：不得修改 Canvas API、数据库、调度器、提供商调用或移动端编辑权限。

## Acceptance Criteria

- [x] AC1：Canvas 的 `ReactFlow` 显式设置 `onlyRenderVisibleElements`。
- [x] AC2：未选中且不涉及 `queued` / `running` 节点的连线不运行流光 CSS 动画，也不应用 SVG 模糊/阴影滤镜。
- [x] AC3：选中连线以及涉及 `queued` / `running` 节点的连线，在 viewport 静止且用户未启用减少动态效果时显示现有流光。
- [x] AC4：缩放或平移期间，所有连线仅保留静态基础路径；结束后恢复符合 AC3 的流光。
- [x] AC5：现有画布选择、节点拖拽、连线、缩放、MiniMap、保存和运行状态展示行为不回退。
- [x] AC6：`.trellis/verification/canvas_workflows_check.mjs` 覆盖上述策略并通过；TypeScript、变更文件 lint、生产构建和本地 `/canvas` HTTP smoke 通过，且不调用外部付费服务。

## Out Of Scope

- 自定义滚轮平滑插值或修改 React Flow 的缩放曲线。
- 按 zoom 阈值折叠节点内容的 LOD。
- 重构运行状态 Context 或按节点订阅。
- 图片/视频缩略图格式、懒加载和 MiniMap 架构调整。
