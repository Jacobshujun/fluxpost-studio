# 内容池内容库/子集与标签管理：技术设计

## Architecture

- 内容池条目继续由 `src/lib/content-pool.ts` 拥有，事实来源仍是 `content_projects.data_json`。
- 新增 `src/lib/content-pool-collections.ts` 负责库/子集树、条目归属和标签管理的领域逻辑，避免 `content-pool.ts` 继续膨胀。
- 新增三张 PostgreSQL/SQLite 表：`content_pool_collections`、`content_pool_collection_items`、`content_pool_tags`。
- 「默认库」是虚拟视图，不建记录：默认库 = 没有任何归属的条目。
- 所有路由保持 thin：`requireWorkspaceAccount` → 解析输入 → 调用 `src/lib/*` → `NextResponse.json`。
- 图库领域保持独立；只复用交互模式、递归子集语义和批量操作契约，不复用表或记录。

## Data Contract

### `content_pool_collections`

| 字段 | 说明 |
| --- | --- |
| `id` | `content-pool-collection-${uuid}` |
| `owner_user_id` | owner scope |
| `parent_id` | 空 = 库；非空 = 子集 |
| `name` | 归一化名称，最长 120 |
| `relative_path` | `库/子集` 缓存路径 |
| `created_at` / `updated_at` | ISO 时间 |
| `data_json` | 预留（颜色/描述/图标） |

索引：`(owner_user_id, parent_id, name)`、`(owner_user_id, relative_path)`。

### `content_pool_collection_items`

| 字段 | 说明 |
| --- | --- |
| `collection_id` | FK → collections，`ON DELETE CASCADE` |
| `item_id` | 逻辑条目 ID（`platform-sourceId` 或 `manual-*`） |
| `created_at` | 归属时间 |

主键：`(collection_id, item_id)`；索引：`(item_id, collection_id)`。

约束：条目 owner 必须与库 owner 一致（无 owner 的历史条目按库 owner 处理）。条目 ID 在多个项目重复时，归属只记录一次；列表按项目 `updatedAt` 倒序取第一个副本。

### `content_pool_tags`

| 字段 | 说明 |
| --- | --- |
| `id` | `content-pool-tag-${uuid}` |
| `owner_user_id` | owner scope |
| `tag_key` | `contentPoolCustomTagKey(label)` |
| `label` | 规范显示名（以条目实际标签为准） |
| `color` | 主题 token；空 = 默认稳定色 |
| `created_at` / `updated_at` | ISO 时间 |
| `data_json` | 预留 |

唯一键：`(owner_user_id, tag_key)`。标签事实来源仍是条目的 `customTags`；注册表只存颜色/显示偏好。

### 类型

`src/lib/types.ts` 新增：

- `ContentPoolTagColor`
- `ContentPoolCollection`
- `ContentPoolCollectionMembership`
- `ContentPoolSelectionCollection`
- `ContentPoolCollectionBatchAction`
- `ContentPoolCollectionBatchRequest`
- `ContentPoolCollectionBatchResult`

扩展：

- `ContentPoolTagSuggestion` → `{ key, label, color, count }`
- `ContentPoolSnapshot` → `{ projects, activeProject, collections, memberships, tags }`
- `ContentPoolSelectionFilter` → 增加 `collectionId?: string`、`includeDescendants: boolean`
- `ContentPoolSelectionPage` → 增加 `collections: ContentPoolSelectionCollection[]`

### 归一化与颜色

`src/lib/content-pool-tags.ts` 新增：

- `contentPoolTagColorValues`
- `contentPoolTagColor(key)`：按 key 稳定映射默认色
- `normalizeContentPoolTagColor(value)`

颜色 token：`mint | cyan | amber | rose | violet | blue | lime | slate`。

## Persistence And Migrations

- `src/lib/database.ts` 的 `createSqliteSchema()` 与 `postgresSchemaSql` 同时新增三张表与索引。
- 新增 `db/migrations/007_content_pool_collections.sql` 作为 PostgreSQL 参考迁移。
- 无迁移执行器；`ensureDatabaseReady()` 在下次启动时执行 `CREATE TABLE IF NOT EXISTS`。
- 不做存量归属回填；默认库由查询计算。
- 删除条目（单条/批量）成功后清理 `content_pool_collection_items` 中对应 `item_id` 的归属；快照忽略孤儿归属，不在读时写入。

### 新增 DB helpers

- `listContentPoolCollectionsFromDb()`
- `saveContentPoolCollectionToDb(collection)`
- `deleteContentPoolCollectionFromDb(collectionId)`：事务内子节点上移 + 删除 + 外键级联归属
- `listContentPoolCollectionItemsFromDb()`
- `addContentPoolCollectionItemsFromDb(collectionId, itemIds, createdAt)`
- `deleteContentPoolCollectionItemsFromDb(collectionId, itemIds)`
- `deleteContentPoolCollectionItemsForItemsFromDb(itemIds)`
- `listContentPoolTagsFromDb()`
- `saveContentPoolTagToDb(tag)`
- `deleteContentPoolTagFromDb(ownerUserId, tagKey)`
- `mutateContentPoolItemsByTagInDb(account, { fromKey, toLabel?, remove? })`：单事务读取含标签的项目，更新可编辑条目的 `customTags`，只写变更行

## Domain

### `src/lib/content-pool-collections.ts`

- `listContentPoolCollections(account)`：owner/admin 过滤，附加 `canEdit` 与直属 `itemCount`。
- `createContentPoolCollection(account, { name, parentId? })`：
  - 名称 NFKC/trim/空白折叠/去控制字符与 `/`，最长 120。
  - 父级必须可编辑且同 owner。
  - 同一父级下同路径直接返回已存在记录（幂等）。
- `updateContentPoolCollection(account, id, { name?, parentId? })`：
  - 自指/后代环校验。
  - 重算自身与所有后代 `relativePath`。
- `deleteContentPoolCollection(account, id)`：
  - 子节点上移到父级并重算路径。
  - 删除库记录；归属级联删除；条目不删除。
- `updateContentPoolCollectionItems(account, request)`：
  - actions：`add_to_collections`、`move_to_collection`、`remove_from_collection`、`move_to_default`、`create_collection_and_add`。
  - `move_to_collection` 只移除来源库归属，保留其他库归属；`move_to_default` 删除全部归属。
  - 逐条校验存在/可编辑/同 owner；合法条目一次事务写入；返回 `{ memberships, unchangedItemIds, failures }`。
- `renameContentPoolTag(account, { from, to })`：
  - `to` 已存在即合并。
  - 更新条目 `customTags`、目标标签注册表；删除源注册表。
- `mergeContentPoolTags` 复用 rename。
- `deleteContentPoolTag(account, { label })`：从可编辑条目移除标签并删除注册表。
- `setContentPoolTagColor(account, { label, color })`：upsert 注册表。
- 标签管理只处理 `customTags`，不触碰 `contentTagging.tags`。

### `src/lib/content-pool.ts`

- `getContentPoolSnapshot`：并行读取 projects、collections、memberships、tag registry；返回扩展快照；标签取使用次数最高的前 100 个。
- `ingestCrawlItems(query, items, account, { collectionId? })`：写入项目后把本批条目幂等加入目标库；未指定则不加归属。
- `createSourceItem(query, item, account, { collectionId? })`：同上。
- `deleteSourceItem` / `batchDeleteSourceItems`：写库成功后清理归属。
- `listContentPoolTagSuggestions`：合并注册表颜色；上限从 50 提高到 500。
- `listContentPoolSelection` / `resolveContentPoolSelection`：读取 collections + memberships，先按库/后代过滤项目条目，再调用现有纯函数。
- `batchUpdateSourceItemCustomTags`：保持现有部分成功与单次写入语义；不再扩展为整池重写。

### `src/lib/content-pool-selection.ts`

- `normalizeContentPoolSelectionFilter` 增加 `collectionId` 与 `includeDescendants`（默认 true）。
- 新增纯函数：
  - `collectionDescendantIds(collections, rootId)`
  - `filterProjectsByCollection(projects, collections, collectionId, includeDescendants)`
- 纯函数不读数据库，便于确定性检查。

## API

新增：

- `GET/POST /api/content-pool/collections`
- `PATCH/DELETE /api/content-pool/collections/[collectionId]`
- `POST /api/content-pool/collections/batch`
- `POST /api/content-pool/tags/manage`：`rename | merge | delete | set_color`

扩展：

- `GET /api/content-pool`：返回扩展快照。
- `GET /api/content-pool/selection`：新增 `collectionId`、`descendants=0|1`；响应增加 `collections`。
- `GET /api/content-pool/tags`：`limit` 上限 500；返回 key/color。
- `POST /api/crawl/jobs`、`POST /api/crawl/links`、`POST /api/content/items`：接受可选 `collectionId`；路由层先校验库存在且可编辑。
- `POST /api/content-pool/tags`：保持 `{ ids, add?, remove? }` 契约。

错误状态：认证失败 401；校验/不存在 400；其余 500。

## UI

### `/content` 布局

- `>=1180px` 四栏：
  `clamp(180px,13vw,220px) | clamp(260px,18vw,320px) | minmax(360px,1fr) | clamp(300px,20vw,420px)`
- `<1180px` 单栏堆叠；内容库栏为可折叠区块，由「内容库」按钮展开。
- 更新 `src/app/globals.css`：`.content-desk-workspace`、`@media (min-width:1540px)`、新增 `.content-desk-library` 及树/标签样式；滚动规则覆盖新栏。

### 内容库侧栏

- 系统项：全部内容、默认库，显示去重计数。
- 用户库/子集树：折叠、缩进、直属计数、行内新建子集/重命名/删除。
- 顶部新建库、搜索框；标签区显示前 N 个标签（颜色点 + 计数）与「管理标签」。
- 名称对话框；删除确认文案说明子集上移、条目不删除。

### 列表与详情

- 主列表跨项目去重；新增可选「来源项目」筛选。
- 库头部显示路径/计数/“包含子集”开关。
- 批量栏新增加入库/子集、移动到、移回默认库。
- 卡片和详情显示所属库/子集 chips。
- 「管理标签」改为对话框，一次提交多个标签；保留逐条失败明细。

### 采集归属

- 采集栏增加「采集到」选择：默认库 + 真实库/子集扁平路径。
- 关键词采集、链接导入、手工新增携带 `collectionId`。

### 标签管理

- 列表：颜色、名称、使用次数、搜索。
- 改色、重命名、合并、删除（确认）。
- `src/components/content-pool-custom-tag-picker.tsx` 增加建议颜色点；选中 chip 使用稳定默认色。

### Canvas

- `ContentPoolSelectionBrowser` 从 selection 响应读取 collections，增加库下拉与“包含子集”。
- `contentPoolSelectionUrl` 写入 `collectionId` / `descendants=0`。
- `emptyContentPoolSelectionFilter` 增加新字段默认值；初始 page 状态增加 `collections: []`。
- `ContentPoolScheduleSourceEditor` 同步支持库筛选。
- `normalizeCanvasScheduleContentPoolFilter` 透传新字段；旧保存筛选缺失字段按默认值处理。

## Compatibility

- 旧条目/旧快照/旧 Canvas 筛选不需要迁移。
- 新表通过 `CREATE TABLE IF NOT EXISTS` 幂等创建。
- 简单运行 pool 模式、冻结快照、评审/发布链路不读取库归属。
- 图库 API/表不变。
- 回滚：移除 UI 消费与新 API 即可；新增表与 JSON 字段不会破坏旧代码。若需彻底回滚，可保留表不读。

## Risks And Rollback

- 快照体积：新增 memberships/tags 为小幅增量；若数据量导致卡顿，后续拆分导航/分页。
- 重复 item ID：归属按逻辑 ID；列表按最新项目副本去重。
- 跨 owner：只允许同 owner 归属；管理员管理所有库但仍按库 owner 解析。
- 标签重命名/删除：单事务、只写变更项目行，操作前确认；失败整体回滚。
- 并发创建：重名检查在应用层，不建唯一索引，避免递归路径更新中间态冲突。
- 回滚点：Schema/DB → Domain/API → UI 三段分别跑聚焦检查，失败不进入下一段。

## Verification

- 新增 `content_pool_collections_check.mjs`：双 DDL/迁移文件表结构、domain 契约、纯函数、selection/Canvas 透传。
- 更新 `content_desk_check.mjs`、`content_pool_tags_check.mjs`、`canvas_content_pool_selection_check.mjs`、`content_projects_upsert_check.mjs`。
- 新增 `content_pool_libraries_browser_check.py`：mock API，1440×900 与 390×844。
- 基线命令：

```powershell
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

- 手工：干净提交后 `npm run local`，验证建库/子集、归属、标签管理和 Canvas 筛选。
