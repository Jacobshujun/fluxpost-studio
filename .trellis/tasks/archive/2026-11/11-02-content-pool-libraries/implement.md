# 内容池内容库/子集与标签管理：实施计划

## 1. Schema 与持久化

- [x] 在 `src/lib/types.ts` 增加集合、归属、标签颜色、批量请求/结果、快照/selection 扩展类型。
- [x] 在 `src/lib/database.ts` 的 SQLite DDL 与 PostgreSQL DDL 新增三张表和索引。
- [x] 新增 `db/migrations/007_content_pool_collections.sql`。
- [x] 新增 collections / memberships / tag registry DB helpers。
- [x] 新增按标签批量更新项目行的 helper，保证单事务、只写变更行。
- [x] 删除条目时清理归属；快照忽略孤儿归属。

## 2. 领域与纯函数

- [x] 新增 `src/lib/content-pool-collections.ts`：库/子集 CRUD、环校验、删除上移、路径重算。
- [x] 实现五种归属 action：加入、移动、移出、移回默认库、建库并加入。
- [x] 实现标签改色/重命名/合并/删除，只处理 `customTags`。
- [x] 扩展 `src/lib/content-pool-tags.ts`：颜色 token、稳定默认色、颜色归一化。
- [x] 扩展 `src/lib/content-pool-selection.ts`：`collectionId`、`includeDescendants`、后代集合与按库过滤纯函数。
- [x] 扩展 `src/lib/content-pool.ts`：快照、标签建议、采集归属、删除清理、selection 过滤。
- [x] 增加纯函数级测试：名称归一化、后代集合、按库过滤、标签 key/颜色。

## 3. API

- [x] 新增 `GET/POST /api/content-pool/collections`。
- [x] 新增 `PATCH/DELETE /api/content-pool/collections/[collectionId]`。
- [x] 新增 `POST /api/content-pool/collections/batch`。
- [x] 新增 `POST /api/content-pool/tags/manage`。
- [x] 扩展 `GET /api/content-pool`、`GET /api/content-pool/selection`、`GET /api/content-pool/tags`。
- [x] 扩展采集/导入/手工新增路由，接受并校验 `collectionId`。
- [x] 所有路由保持 `requireWorkspaceAccount`、owner scope 和 400/401/500 语义。

## 4. 内容台 UI

- [x] 新增 `src/app/content/content-pool-collection-sidebar.tsx`。
- [x] 新增 `src/app/content/content-pool-collection-dialogs.tsx`。
- [x] 新增 `src/app/content/content-pool-tag-manager.tsx`。
- [x] 改造 `src/app/content/page.tsx`：快照消费、跨项目去重、库视图、包含子集、批量归属、编辑归属 chips。
- [x] 采集栏增加「采集到」并传给 crawl/link/manual 请求。
- [x] 标签过滤/管理接入颜色；`ContentPoolCustomTagPicker` 显示颜色点。
- [x] 更新 `src/app/globals.css` 四栏布局、移动端折叠和树/标签样式。

## 5. Canvas

- [x] 扩展 `src/lib/canvas/types.ts` 与 `scheduler.ts` 的库筛选透传。
- [x] 扩展 `src/app/canvas/page.tsx` 的 `ContentPoolSelectionBrowser`：库下拉、包含子集、URL 参数、初始状态。
- [x] 扩展 V2 `ContentPoolScheduleSourceEditor` 的库筛选（复用同一浏览器）。
- [x] 兼容旧 Canvas 保存筛选（缺失字段按默认值）。

## 6. 验证与收尾

- [x] 新增 `.trellis/verification/content_pool_collections_check.mjs`。
- [x] 更新 `content_desk_check.mjs`、`content_pool_tags_check.mjs`、`canvas_content_pool_selection_check.mjs`、`content_projects_upsert_check.mjs`。
- [x] 新增 `content_pool_libraries_browser_check.py`（mock API，1440×900 / 390×844）。
- [x] 运行聚焦检查与 `npx --no-install tsc --noEmit`、`npm run lint`、`npm run build`。
- [x] 运行完整离线基线：`$env:TRELLIS_SMOKE_PORT="45678"; powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`。
- [x] 更新 `status.md`、`feature_list.json`、`architecture_rules.md`、`verification.md`。
- [ ] 审查 diff 与敏感文件边界，提交实现。
- [ ] 从 clean HEAD 启动端口 3001，手工验证 `/content` 与 Canvas。

## Validation Commands

```powershell
npx --no-install tsc --noEmit
npm run lint
npm run build
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

## Review Gates

1. Schema/DB 完成后：`node .trellis/verification/content_pool_collections_check.mjs`（先建立静态/纯函数部分）与 `npx --no-install tsc --noEmit`。
2. Domain/API 完成后：`node .trellis/verification/content_pool_tags_check.mjs`、`node .trellis/verification/canvas_content_pool_selection_check.mjs`。
3. UI 完成后：`node .trellis/verification/content_desk_check.mjs` 与浏览器 mock 检查。
4. 全量基线通过后才更新状态/feature 并提交。

## Rollback Points

- Schema 建表失败或双 DDL 不一致：停止，不进入领域层。
- 领域/API 检查失败：保留表结构，回退新增路由与 UI，不影响现有内容池读写。
- UI 检查失败：回退 UI 组件与页面改动，保留后端能力。
- Canvas 检查失败：回退 Canvas 透传，保留 `/content` 管理能力。
