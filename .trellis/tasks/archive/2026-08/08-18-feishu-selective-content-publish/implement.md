# 飞书内容分项写入实施计划

## Implementation Checklist

- [x] 1. 建立共享 `FeishuPublishMode` 契约、选项标签、严格解析和模式能力判断，并加入纯逻辑离线覆盖。
- [x] 2. 扩展 `FeishuPublishJob`、`SimpleRunInput` 与数据库反序列化，使新任务持久化模式、旧数据默认完整写入。
- [x] 3. 让飞书队列入队、活动任务去重、worker 准备、逐条校验、完成统计和日志全部感知模式。
- [x] 4. 改造飞书 CLI 的 staged payload、字段选择、记录创建、回读、附件准备/上传和 post state 更新，确保未选字段不出现于写请求。
- [x] 5. 扩展人工发布 API 与简单任务 API；透传主页自动任务所有发布分支，非法显式模式返回 400。
- [x] 6. 在主页保留自动写入开关并添加三段模式选择；请求和运行状态使用共享模式值。
- [x] 7. 在内容审查台添加单条/批量共用模式选择，把模式发给 API，并在排队、轮询和恢复状态中显示任务模式。
- [x] 8. 新增 Canvas `publish.feishu@2`、v1 升级逻辑、配置校验和 executor 透传，保持端口/连线兼容。
- [x] 9. 新增并注册 `feishu_publish_mode_check.mjs`，更新受影响的队列、简单任务、审查台和 Canvas 确定性检查。
- [x] 10. 执行聚焦检查、TypeScript、lint、build 和完整 Trellis 基线；启动端口 3001 开发预览并用 Playwright 检查桌面/移动布局且不触发真实飞书写入。

## Affected Files

- Shared/backend: `src/lib/types.ts`, new mode helper, `src/lib/database.ts`, `src/lib/feishu-publish-queue.ts`, `src/lib/feishu-cli.ts`, `src/lib/simple-runs.ts`.
- API: `src/app/api/publish/feishu/route.ts`, `src/app/api/simple/runs/route.ts`.
- UI: `src/app/page.tsx`, `src/app/review/page.tsx`, `src/app/globals.css`.
- Canvas: `src/lib/canvas/registry.ts`, `src/lib/canvas/executors.ts`.
- Verification: focused `.trellis/verification/*.mjs`, `.trellis/verification/check.mjs`, and task/status artifacts required by completion protocol.

## Validation Commands

```powershell
node .trellis/verification/feishu_publish_mode_check.mjs
node .trellis/verification/feishu_publish_queue_check.mjs
node .trellis/verification/simple_queue_check.mjs
node .trellis/verification/review_desk_workflow_check.mjs
node .trellis/verification/canvas_workflows_check.mjs
npx --no-install tsc --noEmit
npm run lint
npm run build
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
npm run dev
```

## Review Gates

- [x] 请求缺失模式时仅为历史兼容默认 `full`；显式非法字符串被拒绝。
- [x] 三种入口都引用同一模式契约，没有本地字符串分叉。
- [x] 文本模式的任何 CLI JSON/参数不含附件或元数据字段，媒体模式不含标题、正文或元数据字段。
- [x] 文本模式不做媒体准备，媒体模式不查询车型选项或补全内容标签。
- [x] 模式参与活动任务去重，且排队恢复后仍可见。
- [x] 旧队列 JSON、旧简单任务和 Canvas v1 节点继续按完整写入运行。
- [x] 无真实飞书、付费模型或生产服务调用。

## Rollback Points

- Shared contract/type errors：回滚步骤 1-2，不保留半接线字段。
- Queue/CLI 行为错误：回滚步骤 3-4，保留完整模式原路径。
- UI 或 Canvas 回归：分别回滚步骤 6-8，不改变已验证的后端模式契约。
