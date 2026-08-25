# 隔离 Excel 审查与调度策略

## Goal

Excel 节点只负责工作簿解析、行/卡片展开和生成审查稿，不改变通用 Canvas 调度、审查或飞书发布规则。

## Requirements

- V2 Excel 行与普通 V2 任务共用 `aggregationPolicy`：`at-least-one` 至少一个子任务成功即可产稿，`all` 必须全部成功。
- 不再因部分子任务失败向审查稿写入 `canvasImageBatch`，该字段从生成稿类型、组装、同步和发布链路移除。
- Canvas 内部继续保留 `partial`、失败序号、schedule/run/node-run 历史用于诊断，但这些信息不得阻断审查或飞书发布。
- 审查台移除图片部分完成提示、失败序号提示、相关按钮禁用，以及 Excel 专属人工核对提示；保留 Excel 行号、卡片编号和草稿入口。
- 飞书完整、纯文本、纯媒体模式忽略历史稿件里的 `canvasImageBatch`，其他正文、车型、媒体和模式校验保持不变。
- 撤销 partial 专用重试入口和逻辑；保留 `failed`、`blocked`、`needs_config` 的既有重试。
- 历史 `taskConcurrency` 继续兼容读取但不参与调度，所有符合条件的子任务立即入队。
- 提供本地维护命令，默认 dry-run，仅 `--apply` 修改；同时支持 PostgreSQL 与 SQLite，删除所有 generated post JSON 中的 `canvasImageBatch`，不修改其他字段、状态、更新时间或 Canvas 历史。
- 不新增管理 API 或自动启动迁移，不调用真实图片服务或飞书写入，不推送或部署生产。

## Acceptance Criteria

- [x] Excel 与普通 V2 聚合行为一致，`at-least-one` 与 `all` 分别满足上述规则。
- [x] 新生成和候选同步的审查稿不包含 `canvasImageBatch`。
- [x] 审查台无 partial/失败序号警告，单条和批量写入按钮不受历史 partial 字段影响。
- [x] 飞书三种模式不因遗留 `canvasImageBatch` 拒绝，同时原有业务校验仍通过测试。
- [x] partial 专用重试入口和服务判定消失，普通失败重试仍可用。
- [x] 清理命令的 SQLite dry-run/apply 有隔离测试；PostgreSQL 使用事务化 JSONB key removal 并有静态验证。
- [x] 完成 focused checks、TypeScript、lint、build 和 Trellis baseline。
- [x] 提交后用干净 HEAD 激活端口 3001，再执行清理 dry-run/apply 并确认遗留字段为 0。
- [x] 桌面和移动端验证审查台按钮状态，不触发真实发布。

## Constraints

- 不修改 Canvas schedule、run 或 node-run 历史。
- 不删除 Excel 解析、预设、来源信息、失败状态或普通失败重试。
- `partial` 是 Canvas 运行诊断状态，不是审查或发布策略。
