# Design

## Architecture

- `library_assets` 保存可直接筛选和排序的标量列及完整 JSON 详情；列表只选择紧凑投影。
- `library_collections` 保存普通图集；`library_collection_assets` 继续作为独立关系，成员关系不再镜像为资产 `collectionIds` 的权威来源。
- 新增 `library_smart_folders` 和 `library_asset_favorites`。标签继续使用 `library_asset_labels`。
- `src/lib/library-assets.ts` 负责输入规范化、权限和业务命令；`src/lib/database.ts` 提供 PostgreSQL/SQLite 等价的查询和事务实现。
- 智能文件夹先规范化为同一 `LibraryAssetFilters`，再由数据库查询编译器生成参数化 SQL；禁止拼接用户值。

## Contracts

- `LibraryCollection`: id、owner、visibility、kind=`folder`、name、parentId、relativePath、timestamps、canEdit。
- `LibrarySmartFolder`: id、owner、visibility、name、match、conditions、timestamps、canEdit。
- `LibraryAssetView`: 卡片标量、有效标签、收藏状态、thumbnailUrl、canEdit；详情 API 返回完整 AI/人工标签数据。
- `LibrarySelection`: 明确 ID 或查询筛选加排除 ID；服务端始终重新应用调用者权限。
- 列表 cursor 包含版本、排序、排序值、ID 和规范化筛选签名。

## Data And Migration

- 增量 migration 以幂等元数据标记执行。每个旧 owner/role 创建确定性根图集，并将角色资产加入关系表。
- 旧图集移除 role，设置为 private，并挂到对应 owner/role 根图集；已有父子关系保持不变。
- 资产 JSON 清除 roles/roleAddedAt/collectionIds，补齐 note；旧标签和对象键不变。
- Canvas/schedule/workflow JSON 递归迁移 `library-filter.role` 为对应 `collectionId + includeDescendants`，保留模式名和其他字段。
- 所有迁移在单数据库事务中完成并以版本 marker 防止重复。

## Query Design

- 权限谓词：管理员全部；普通用户为本人资产或 team 资产。
- 图集子树使用 recursive CTE；未分类使用 `NOT EXISTS`；收藏使用当前用户关系。
- 标签条件使用按维度 `EXISTS`，统一标签重复参数使用独立 `EXISTS` 以实现 AND。
- 文本搜索覆盖名称、原始名、备注和标签；PostgreSQL 使用搜索向量/GIN，SQLite 使用可用的 FTS5，否则使用受索引候选范围约束的等价回退。
- 精确 total 使用与列表相同谓词；侧栏计数按打开视图惰性查询。

## Compatibility And Failure Handling

- 已冻结任务只读旧快照，不回查统一图库。
- 迁移找不到旧 owner/role 根映射时显式失败，不静默退回全库。
- 永久删除先标记 pending，再删除 TOS 对象和数据库行；失败保留可重试状态。
- 图集删除事务内上移子级并删除当前关系；资产保留。
- 批量查询操作先冻结匹配 ID，再逐批事务执行并报告部分失败，避免筛选在操作过程中漂移。
