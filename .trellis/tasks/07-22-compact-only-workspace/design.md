# Technical Design

## UI Boundaries

- `src/app/page.tsx` 只保留账号、配置状态、工作区设置、simple-run、素材库只读数据、精简任务表单和底部进度。
- 精简工作区由单一组件渲染，不再接受 `variant`，不保留标准详情面板分支。
- `src/app/content/page.tsx` 增加本地 `content | materials` 视图状态。内容视图保持现有三栏工作台；素材视图承接原首页素材管理组件和 API 调用。
- 素材管理保持路由内组件，不新增跨页面组件层；首页只复用素材领域数据，不复用管理 UI。

## Data Flow

- 首页登录后读取 config、workspace settings、simple runs 和 material library；不再读取 content pool、batch jobs、generated posts 或 Feishu vehicle options。
- 精简任务仍将素材库路径和当前设置提交给 `/api/simple/runs`，后端 simple-run 行为不变。
- 内容台素材视图通过 `/api/materials/scan`、`/api/materials/library` 和 `/api/materials/preview` 完成 owner-scoped 管理。
- 内容审查继续通过 `/api/production/posts` GET 加载草稿，写操作继续走 `/api/review`、批量状态和发布接口。

## Removed Contracts

- 删除 `/api/generate`、`/api/production/batches`、`/api/production/posts/regenerate`。
- `/api/production/posts` 删除 POST/PATCH/DELETE，仅保留 GET。
- 删除 `src/lib/batch-production.ts`、批量生产类型及活动数据库读写适配；不修改已有迁移中的 `batch_jobs` 表定义，不执行数据删除。

## Compatibility And Rollback

- simple-run、素材库、草稿、发布队列和独立页面契约保持兼容。
- 已删除 API 没有仓库内消费者，不增加 410 或兼容空壳。
- 回滚以源码恢复为主；数据库未发生破坏性变更，不需要数据回滚。
