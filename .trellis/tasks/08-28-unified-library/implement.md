# Implementation

1. 扩展类型、SQLite/PostgreSQL schema、增量迁移与统一图库数据访问层。
2. 实现数据库侧列表查询、智能文件夹编译、收藏、图集层级和服务端查询选择。
3. 更新图库资产、图集、标签、智能文件夹、收藏、导入和批量 API。
4. 重构 `/library` 为统一工作区并改用缩略图、请求取消和服务端全选。
5. 迁移 Canvas、简单模式和其他消费者到图集/智能文件夹/临时筛选来源。
6. 新增迁移、权限、查询、批量、智能文件夹、消费者和性能聚焦检查。
7. 运行 `npx --no-install tsc --noEmit`、`npm run lint`、`npm run build` 与 Trellis 完整离线 baseline。
8. 更新 FluxPost 状态、feature evidence 和必要的稳定架构/陷阱/验证事实。

## Completion Evidence

- Unified SQLite migration/query runtime check passed, including every smart-folder field, `all/any`, favorites, permissions, role roots, hierarchy, and Canvas conversion.
- PostgreSQL 50,000-asset/1,000,000-label benchmark passed all P95 targets; collection subtree measured `252.6ms` against `300ms`.
- Mocked Chrome passed unified library workflows at `1440x960` and `390x844` without horizontal overflow or original-image card requests.
- TypeScript, lint (0 errors, 20 warnings), production build, isolated HTTP smoke, SQLite store check, and the complete Trellis baseline passed without external calls.

## Risk Points

- PostgreSQL 与 SQLite 查询语义必须一致。
- 旧角色迁移涉及持久化 Canvas JSON，必须幂等且不能扩大可见性。
- 不得让 50k 查询或全选重新退化为全库 JSON 加载。
- 不得在默认验证中调用 TOS、GPT、Feishu 或生产服务。
