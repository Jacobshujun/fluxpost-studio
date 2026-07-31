# 共享资料库排序与框选设计

## Overview

本任务修改现有 `/library` 图片库与 `/copy-library` 文案库，不增加数据库表或迁移。服务端成为排序顺序的唯一事实源；浏览器只保存个人排序偏好和当前选择。默认可见性在客户端与领域边界同时改为 `team`，但显式 `private` 和历史记录保持兼容。

## Affected Boundaries

- Shared contracts: `src/lib/types.ts` 与新的共享排序/框选辅助模块。
- Image domain/API: `src/lib/library-assets.ts`, `src/app/api/library/import/route.ts`, `src/app/api/library/assets/route.ts`（路由继续保持薄层）。
- Copy domain/API: `src/lib/copy-library.ts`, existing `/api/copy-library` and `/api/copy-library/:id` routes.
- UI: `src/app/library/page.tsx`, `src/app/library/library.module.css`, `src/app/copy-library/page.tsx`, `src/app/copy-library/copy-library.module.css`.
- Verification: `.trellis/verification/library_assets_check.mjs`, `.trellis/verification/copy_library_check.mjs`，必要时新增一个只测试共享纯逻辑的确定性脚本。

`src/app/content/page.tsx` 当前有用户未提交修改，本任务不触碰该文件。

## Shared Sort Contract

定义一个跨 UI/API/domain 使用的受限排序联合类型：

```ts
type LibraryListSort =
  | "newest"
  | "oldest"
  | "name-asc"
  | "name-desc"
  | "owner-asc"
  | "owner-desc";
```

- 图片的 `newest/oldest` 比较 `createdAt`，`name-*` 比较 `name`。
- 文案的 `newest/oldest` 比较 `updatedAt`，`name-*` 比较 `title`。
- `owner-*` 比较 `ownerDisplayName`。
- 文本比较统一使用 `localeCompare(..., "zh-CN")`，所有排序最终以 `id` 决胜。
- `GET /api/library/assets` 与 `GET /api/copy-library` 接收 `sort` 查询参数；缺失或无效值回落到 `newest`，保留现有调用方兼容性。

## Image Cursor Pagination

图片库继续在领域层完成筛选、排序和分页。游标从固定 `{ createdAt, id }` 扩展为带排序语义的版本化载荷，至少包含 `sort`, `value`, `id`：

1. 当前排序决定 `value`（时间、名称或提交人）。
2. 下一页过滤复用与列表排序完全相同的比较函数。
3. 游标携带的 `sort` 必须与请求排序一致；不一致或畸形游标返回现有明确的 invalid cursor 错误。
4. UI 改变排序后查询字符串变化，现有请求序号机制丢弃旧响应，并从第一页重新加载。

这避免只对已加载 60 张图片排序，也保证同名、同提交人和同时间记录不会跨页重复或遗漏。

## Default Visibility Compatibility

- 文案新建草稿和 `normalizeCopyLibraryInput(..., true)` 的缺省值改为 `team`。
- 图片上传表单、导入路由和 `importLibraryAsset` 的正常缺省值改为 `team`。
- 显式传入 `private` 仍通过现有校验并原样保存。
- `migrateLegacyMaterialAssets` 显式传 `private`，避免未来执行历史迁移时因新缺省值改变原 owner-scoped 语义。
- 重复图片复用现有资产时保留该资产既有可见性，不借导入动作改写权限。

## Sort Preference Persistence

两个页面使用不同的 namespaced localStorage key。首个服务端/水合渲染使用 `newest`；挂载后读取并校验存储值，无效值回落到 `newest`。用户切换排序时立即保存，排序仍通过 API 查询完成。偏好不写入数据库，也不跨用户同步。

## Shared Marquee Selection

提取一个页面共享的 React Hook，并导出可独立验证的矩形标准化/相交纯函数：

- Hook 接收容器 ref、当前 selected ids、选择变化回调和条目 id data attribute。
- 仅主鼠标指针且 `event.target === event.currentTarget` 时启动候选拖动；触控、右键和条目内控件不启动。
- 超过小幅移动阈值后显示 `position: fixed`、`pointer-events: none` 的选择矩形并抑制文本选择。
- 每次移动用条目的 `getBoundingClientRect()` 与选择矩形相交计算命中集合。
- 普通拖动结果为命中集合；`Ctrl`/`Meta` 从 pointer-down 时的选择快照开始做并集。
- pointer up/cancel 释放捕获并清理选择框。此版本不实现边缘自动滚动。

图片卡片和文案条目各暴露稳定的 selectable id 属性。图片复用现有 Set 与批量栏；文案新增独立 `selectedIds` Set 和复选框，当前编辑 `selectedId` 继续单独管理，防止批量选择覆盖未保存草稿。

## Copy Batch Operations

沿用图片库现有的逐条请求与汇总模式：

- 批量可见性对选中 id 调用现有 `PATCH /api/copy-library/:id`。
- 批量删除二次确认后调用现有 `DELETE /api/copy-library/:id`。
- 使用 `Promise.all` 收集每条成功/失败，不把部分失败伪装成整体成功；完成后重新加载服务端排序结果并收敛选择。
- 现有详情路由的 owner/admin 鉴权继续作为安全边界，普通成员对只读团队文案收到 `403` 并计入失败。

不增加新的批量 API，避免复制权限逻辑或引入新的部分成功响应合同。

## Copy Selection Commands

文案库继续将单条编辑的 `selectedId` 与批量操作的 `selectedIds` 分开管理。普通条目点击只打开编辑器；修饰键点击只改变批量选择，避免用户在连续选择时反复打开编辑器。

- 使用一个锚点 ref 记录最近一次直接选择的条目；`Shift` 点击按当前服务端排序后的可见条目顺序计算闭区间。
- `Ctrl`/`Cmd` 点击切换目标条目，`Ctrl`/`Cmd` + `Shift` 点击把范围并入当前集合，单独 `Shift` 点击则用范围替换当前集合。
- 显式全选控件与 `Ctrl`/`Cmd+A` 共用同一命令，选择当前筛选结果中的全部条目；加载新结果后沿用现有收敛逻辑移除不可见 id。
- `Esc` 清空批量选择；非编辑区域的 `Delete` 只打开现有批量删除确认，不直接执行破坏性操作。
- 页面级键盘监听在输入、文本域、下拉框、`contenteditable` 后代或任一确认弹窗打开时退出。

## Copy Workspace Scrolling

文案库根节点占满 `100dvh` 并隐藏文档级溢出，页头保持固定高度，工作区只占剩余空间。左侧窗格维持列向 flex 布局，筛选、选择工具和批量栏不参与滚动，只有 `flex: 1; min-height: 0; overflow: auto` 的列表滚动。右侧编辑器沿用独立 `overflow: auto`。移动端工作区和资料窗格显式占满剩余高度，避免列表内容重新撑高根页面。

## Responsive And Accessibility

- 排序使用原生 `select`，提供明确 `aria-label`。
- 文案多选使用真实 checkbox；图片保留现有 checkbox。
- 选择矩形为纯视觉元素，`aria-hidden`，不会进入键盘焦点顺序。
- 700/760px 移动断点下不启用 marquee Hook，但批量栏、复选框和排序控件仍可操作且文字不溢出。
- `prefers-reduced-motion` 下不为选择框增加动画。

## Rollback

代码层回滚即可恢复旧默认和固定排序；无数据库迁移或数据重写需要撤销。若排序游标出现问题，可回滚共享排序参数与版本化游标，同时旧调用方因默认 `newest` 不受影响。已经按新默认创建的团队条目属于用户可见的数据变更，不应由代码回滚自动改回私有。
