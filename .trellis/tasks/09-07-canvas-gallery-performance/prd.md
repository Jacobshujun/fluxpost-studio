# Canvas 图库节点性能优化

## Goal

打开 Canvas 的 `input.library-images` 节点时保持立即可交互；图片很多时不再触发全库列表、原图批量加载或无关节点重渲染。

## Confirmed background

- `LibraryImageSnapshotPicker` 当前挂载即请求最多 100 条素材，并自动加载导航。
- 选择器结果使用原图 URL 作为 CSS 背景；素材库已提供缩略图 URL 和缓存接口。
- Canvas 使用 React Flow 的 `onlyRenderVisibleElements`，但 `CanvasFlowNode` 尚未 memo，交互 Context 含选中节点状态。
- API 查询当前总是执行精确 `COUNT(*)`；图库页面需要总数，Canvas 选择器不需要。

## Requirements

1. 初次打开图库节点不请求素材列表或导航；用户输入搜索词、标签或选择图集后才请求。
2. 首次请求最多 24 条，支持现有游标分页和去重；已选素材快照最多 30 张且不因分页丢失。
3. 选择器列表和已选区域使用服务端缩略图；点击预览时才使用原图。
4. 导航数据延迟到图集控件首次需要时加载，并在 Inspector 生命周期内复用。
5. Canvas 节点使用 memo，Inspector 选中状态不通过全局 Context 令所有节点重渲染；运行结果更新仍正常。
6. Canvas 列表可关闭精确总数查询；图库页面继续返回精确总数。
7. 缩略图接口支持条件请求命中时返回 304，并保持现有授权、缓存版本和媒体边界。

## Acceptance criteria

- 无筛选打开节点不产生 `/api/library/assets` 或 `/api/library/navigation` 请求。
- 搜索请求使用 `limit=24` 和 `includeTotal=false`（或等价参数），旧请求不会覆盖新结果。
- 正常列表流程只加载缩略图；原图仅在预览命令后请求。
- 加载更多不重复渲染素材；跨页选择和 30 张上限保持不变。
- 1440x960 与 390x844 的 Canvas UI 无横向溢出；Canvas 工作流、TypeScript、lint、build 和完整离线基线通过。

## Out of scope

- 不引入新的虚拟列表依赖。
- 不改变工作流快照、素材权限、运行时冻结 URL 或 `/library` 页面总数行为。

## Goal

TBD.

## Requirements

- TBD

## Acceptance Criteria

- [ ] TBD

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
