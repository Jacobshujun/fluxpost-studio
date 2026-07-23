# Design

## Architecture

- `src/lib/library-*` 负责资产存储、标签、队列、TOS 导入和旧库迁移；API 路由只做鉴权、解析和响应。
- `src/lib/database.ts` 提供 PostgreSQL/SQLite 行级 CRUD 与队列 claim，不复用旧素材整库重写路径。
- `/library` 为独立客户端页面，页面内组件负责筛选、导入、网格和预览局部状态，服务器状态始终从 API 刷新。

## Data Flow

1. 浏览器逐文件提交 multipart 与角色、集合、相对路径、可见性。
2. 服务端鉴权、嗅探格式、计算哈希并检查当前用户重复。
3. 暂存文件通过现有 verified TOS 边界上传并 HEAD 校验；成功后创建资产、角色/集合关系和打标任务。
4. 后台 worker 从 `library_tagging_jobs` claim 任务，调用现有 OpenAI 视觉文本接口，规范化 AI profile 并更新资产。
5. 人工编辑保存完整维度覆盖；读取时按 `manual override > AI` 生成 effective profile。
6. 预览以当前过滤结果为稳定序列；资产变更后客户端根据 asset id 重算索引。

## Contracts

- 资产角色：`reference | vehicle`；可见性：`private | team`；人物：`yes | no | unknown`。
- 打标状态：`queued | running | completed | failed`；对象清理：`ready | pending | failed`。
- 同维度筛选为 OR，跨维度为 AND；游标按 `created_at DESC, id DESC`。
- 删除集合成员、移除角色、永久删除使用不同命令；永久删除先隐藏资产，再清理 TOS，失败保留可重试状态。
- 预留 `ReferenceAssetSelection { assetIds: string[] }`，本期无消费者。
- 统一标签是 `LibraryTagProfile` 的展示投影，不新增持久化表；新增文字写入人工 `customTags`，删除同名投影时写入相关维度覆盖，恢复 AI 清空人工覆盖。
- `GET /api/library/tags` 返回当前账号可见且按角色限定的标签建议；`POST /api/library/tags` 对一个或多个资产执行权限受控的增删并返回逐项失败。
- `GET /api/library/assets` 的重复 `tag` 参数使用 AND；原维度查询参数继续保留兼容。
- 图库样式使用全局主题变量和现有主题存储边界；图片舞台使用固定深色视觉检查背景。

## Compatibility

- 旧 `material_*` 表和 `/api/materials/*` 不改变。
- 旧库迁移只复制图片和元数据，并保存唯一 `legacyMaterialAssetId`；不会修改或删除旧记录。
- 内容台素材入口可链接新图库，但现有主工作台爆款选择器继续读取旧 API。
