# 优化无限画布交互与默认收起节点库

## Goal

让 FluxPost Canvas 的桌面交互接近 ComfyUI 的无限画布：用户点击画布空白区域即可按住拖拽平移画布；节点多选改为显式按住 Alt 后拖拽框选；左侧节点库默认收起，仍可通过现有按钮打开。

## Confirmed Facts

- 入口位于 `src/app/canvas/page.tsx`，底层使用 `@xyflow/react`。
- 当前桌面配置为 `panOnDrag={isMobile}`、`selectionOnDrag={!isMobile}`；桌面空白拖拽用于框选，移动端空白拖拽用于平移。
- 节点库由 `paletteVisible` 控制，工作区通过 `canvas-workspace-palette-hidden` / `canvas-palette-collapsed` 隐藏，顶部已有切换按钮；当前状态初始为展开。
- 画布已有节点拖拽、连线、右键快速添加、节点点击选中、快捷键和移动端专用行为，改动应保持这些能力。
- 现有 CSS 已为 `.react-flow__pane.draggable`、`.dragging`、`.selection` 定义光标状态，并通过三栏 grid 支持节点库折叠。

## Requirements

- 桌面端在画布空白处按住主指针拖动时平移 viewport，光标反馈为可抓取/抓取中。
- 桌面端只有在按住 Alt 的情况下，拖动画布空白处才进入矩形多选；未按 Alt 的空白拖动不得创建选择框。
- 节点点击选中、节点拖动、连线、右键快速添加、滚轮缩放、复制/删除等既有操作保持可用。
- 节点库默认收起；打开/收起按钮保持可发现、可访问，并且移动端节点库抽屉行为不被破坏。
- 移动端继续使用当前移动端策略，不要求 Alt 手势；布局不得出现横向溢出。

## Acceptance Criteria

- [ ] 首次进入 `/canvas` 时桌面左侧节点库不可见，画布占据原节点库区域；点击节点库切换按钮可展开，再次点击可收起。
- [ ] 桌面在 `.react-flow__pane` 空白区域按住主指针拖动会改变 viewport；拖动期间显示 grabbing 光标。
- [ ] 桌面未按 Alt 拖动空白区域不会出现 `.react-flow__selection`；按住 Alt 拖动才会出现并选中框内节点，支持多节点。
- [ ] 节点点击、节点拖动、端口连线、右键快速添加、滚轮缩放和现有快捷键回归通过。
- [ ] 移动端 `/canvas` 仍可平移、打开节点库抽屉，且 390px 视口无横向溢出。
- [ ] TypeScript、lint、生产构建及项目规定的 Canvas/浏览器离线基线通过。

## Out Of Scope

- 不改 Canvas 图数据、API、节点注册表、运行调度或持久化协议。
- 不引入新的画布库或重做节点视觉样式。
- 不改变移动端的多选手势或增加触屏 Alt 等价操作。

## Resolved Decisions

- 多选仅限 `Alt + 空白拖拽` 框选；不增加 Alt 点击追加，也不保留 Ctrl/Meta 点击追加，避免出现不需要 Alt 的多选路径。
- 节点库只要求默认收起，不持久化用户选择；当前页面会话内仍可用顶部按钮切换，移动端抽屉继续由现有状态控制。

