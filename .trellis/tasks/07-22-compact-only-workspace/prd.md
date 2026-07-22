# 首页仅保留精简版

## Goal

将首页收敛为唯一的精简任务工作区，移除低使用率的简单版详情和高级生产界面，同时保留独立内容池、内容审查、分发审查和管理员配置页面。

## Background

- 当前首页同时包含 `compact`、`simple`、`advanced` 三种工作模式，默认进入 `compact`。
- 精简版和简单版共用 `/api/simple/runs`、工作区设置、素材库和任务轮询；高级版额外加载内容池、批量生产、生成草稿、素材管理和内嵌复核状态。
- 精简版的爆款图片模仿依赖素材库。高级版移除后，素材库管理必须迁入保留的 `/content` 页面。

## Requirements

- 首页直接渲染现有精简版任务发起界面与底部任务进度，不再显示工作模式切换。
- 保留精简版全部来源模式、提示词设置、媒体策略、飞书开关、素材选择、任务轮询、多任务进度和强制终止。
- 首页保留 `/content`、`/review`、`/distribution-check`、`/config` 导航入口。
- 删除简单版详细任务面板、高级生产工作台及其首页专用状态、请求和组件。
- `/content` 增加“内容池 / 素材库”视图切换，并接管素材扫描、文件夹/资产增删改和预览。
- 删除无消费者的生成、批量生产和再生成 API；生成草稿列表 API 收敛为只读。
- 删除批量生产服务、活动类型和无引用数据库适配代码，但不得删除 `batch_jobs` 表或历史数据。
- 用户可见文案统一使用“精简版”或“自动任务”；`/api/simple/runs`、`SimpleRun`、`simple_runs` 等内部契约保持不变。
- 默认验证不得触发真实 TikHub、AI、ComfyUI、飞书写入或 simple-run 生产。

## Acceptance Criteria

- [ ] 登录后首页直接显示精简工作区，活动源码中不存在 `WorkspaceMode`、`WorkspaceModeSwitcher` 或高级模块渲染分支。
- [ ] 精简任务请求仍携带工作区设置、素材路径和媒体策略，任务轮询及强制终止仍可用。
- [ ] `/content` 可切换到素材库并完成原有素材扫描、文件夹/资产 CRUD 和图片预览。
- [ ] `/review`、`/distribution-check`、`/config` 以及内容池二次创作保持可访问。
- [ ] `/api/generate`、`/api/production/batches`、`/api/production/posts/regenerate` 不再存在，`/api/production/posts` 仅保留 GET。
- [ ] `BatchProductionJob`、`ProductionTask` 和活动批量生产服务不再出现在源码中，历史表和已有数据不被删除。
- [ ] 聚焦静态检查、lint、TypeScript、build、完整 Trellis 基线和本地生产页面检查通过。

## Out Of Scope

- 不重命名 simple-run 的 API、类型、表或队列。
- 不删除或迁移现有运行时数据、素材、草稿、发布队列和数据库表。
- 不重新设计独立审查、分发审查或管理员配置页面。
