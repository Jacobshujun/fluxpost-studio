# Canvas ComfyUI 交互设计

## Architecture

只调整 `src/app/canvas/page.tsx` 的 React Flow 交互参数和节点库初始状态，以及 `src/app/globals.css` 中画布光标/选择框的状态样式；不改变 Canvas 图模型、保存流程、API、节点注册或运行时。

桌面端将 React Flow 配置为：

- `panOnDrag={true}`：空白区域左键拖拽平移 viewport。
- `selectionOnDrag={true}` 与 `selectionKeyCode="Alt"`：React Flow 在 Alt 被按住时禁用平移并启用空白框选。
- `multiSelectionKeyCode={null}`：禁用 Ctrl/Meta 点击追加，保证所有多选路径都需要 Alt 框选。

React Flow 内部在 selection key 按下时会优先于 `panOnDrag`，因此不需要自定义 pointer 事件或覆盖 viewport 计算。移动端继续传入 `panOnDrag={true}`、`selectionOnDrag={false}`，并保持 `nodesDraggable` / `nodesConnectable` 的现有禁用策略；Alt 相关参数在移动端不产生框选行为。

节点库将 `useState(true)` 改为 `useState(false)`。顶部切换按钮和移动端菜单不变，现有 grid 隐藏类继续让画布获得节点库释放的宽度。无需 localStorage 或新增状态同步。

## Interaction And Accessibility

- 保留现有 `.react-flow__pane.draggable` / `.dragging` 光标规则，并补充 Alt 框选时的选择光标状态（若 React Flow 的 `selection` class 已覆盖，则仅调整颜色/光标，不添加自定义遮罩）。
- 现有 `onPaneClick` 继续清除当前节点选择和快速添加菜单；平移结束不会误触发点击，因为 React Flow 的拖动距离阈值会抑制 pane click。
- 保留 `onSelectionChange`，框选后的最后一个节点继续驱动右侧检查器；节点实际 selected 状态仍由 React Flow 的 `onNodesChange` 管理。
- 不在画布中增加说明性文案；通过现有图标按钮的 `aria-label` / `title` 暴露节点库开关。

## Compatibility And Risks

- `@xyflow/react` 当前版本明确支持 `selectionKeyCode`, `selectionOnDrag`, `multiSelectionKeyCode`, `panOnDrag`，不需要升级依赖。
- 右键快速添加依赖 `.react-flow__pane` 命中和 `onContextMenu`，不受左键平移改变影响。
- Alt 同时被浏览器/操作系统用于窗口级快捷操作时，浏览器页面内仍由 React Flow `useKeyPress` 捕获；表单输入会被现有 editable-target 逻辑排除。
- 画布 viewport 移动仍触发现有 `onMoveEnd` 保存逻辑；节点拖动、连线和缩放不改动。

## Verification Strategy

增加一个聚焦的离线源码契约检查，断言默认收起和四个 React Flow 参数；使用现有 Playwright/Chromium 画布检查补充桌面空白拖拽 viewport 变化、普通拖拽无选择框、Alt 拖拽选择框和移动端无横向溢出。随后执行 TypeScript、lint、build 与项目规定的完整离线 baseline。
