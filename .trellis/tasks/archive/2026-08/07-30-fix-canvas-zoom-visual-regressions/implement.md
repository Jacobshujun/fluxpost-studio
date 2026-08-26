# Implementation Plan

## 1. Add Focused Contracts

- 更新 `.trellis/verification/canvas_workflows_check.mjs`：普通边也具备流光路径，选中颜色变量继承业务色，moving selector 不再隐藏媒体，自定义缓动缩放入口不存在，且 display-only 状态不进入图持久化。
- 任务内模拟浏览器检查覆盖普通/选中边的计算样式、viewport 移动中的媒体 visibility/DOM identity/请求次数、React Flow 原生 wheel/Controls 缩放、指针锚点、节点/handle 几何、MiniMap/Controls 和 reduced motion。

## 2. Repair Edge Semantics

- 修改 `src/app/canvas/page.tsx` 的 `FlowingCanvasEdge` 与 `toFlowEdges`，恢复所有可见边的流光并区分普通/强调层级。
- 修改 `src/app/globals.css`，为普通边提供轻量动画，为选中/运行边保留强调滤镜，并显式保持 selected 基础路径业务色。

## 3. Keep Media Visible During Interaction

- 从 moving 降载选择器中移除图片网格与节点结果容器，保留非媒体 chrome、MiniMap、阴影和边动画的交互期降载。
- 不改变 detail-tier 阈值、媒体组件树或节点几何。

## 4. Restore React Flow Native Zoom

- 删除自定义 wheel 目标累计、easing/options、动画 refs/timer 与 route-local Controls。
- 恢复默认 wheel/触控板/触屏缩放、内置 Controls、原始移动 class 和 `onMoveEnd` 持久化语义。

## 5. Verify And Record

1. `node .trellis/verification/canvas_workflows_check.mjs`
2. `npx --no-install tsc --noEmit`
3. `npx --no-install eslint src/app/canvas/page.tsx`
4. `git -c safe.directory=C:/Users/Administrator/.codex/social-content-studio diff --check`
5. `npm run build`
6. `npm run local:restart`
7. Run the task-local mocked Chromium check without external services.
8. Run `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` and report any documented repository blocker accurately.
9. Update affected stable Canvas rules/status/evidence only after verification; do not deploy production.

## Risk And Rollback Points

- 原生滚轮缩放的 transform 更新次数由 React Flow 管理；浏览器检查只验证缩放发生、指针锚点、媒体持续可见和几何稳定，不再要求多帧 easing。
- Restoring flow paths and media paint increases stationary/movement paint versus phases 1/2; visible-element culling, moving beam suspension, one viewport layer, MiniMap/chrome suppression and LOD remain the retained bounds.
