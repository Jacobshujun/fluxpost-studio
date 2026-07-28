# 文案库与画布批量二创实施计划

## 1. Persistence And Domain

- [ ] 在 `src/lib/types.ts` 增加文案库共享类型。
- [ ] 在 `src/lib/database.ts` 增加 PostgreSQL/SQLite schema 及文案行级 list/get/upsert/delete helper。
- [ ] 在 `db/migrations/001_initial_postgres.sql` 同步 PostgreSQL 表与索引。
- [ ] 新增 `src/lib/copy-library.ts`，实现验证、标签规范化、可见性、账号权限、筛选和 CRUD。
- [ ] 用 focused TypeScript/离线检查确认双后端契约，不接触真实用户数据。

## 2. API And Library UI

- [ ] 新增 `/api/copy-library` 与 `/api/copy-library/[id]` 薄 route，覆盖登录和错误状态。
- [ ] 新增 `/copy-library` 页面与 CSS module，实现列表、搜索/标签/可见性筛选、创建、编辑、共享切换和确认删除。
- [ ] 在现有工作台、图片库和画布相关入口补充文案库导航，不改其他工作流布局。
- [ ] 验证键盘操作、长标题/正文、空状态、只读共享状态及移动端布局。

## 3. Canvas Node

- [ ] 扩展 `src/lib/canvas/types.ts` 的节点与配置字段联合类型。
- [ ] 在 `src/lib/canvas/registry.ts` 注册 `input.copy-library`，定义快照字段、标题/正文输出及校验。
- [ ] 在 `src/lib/canvas/executors.ts` 增加确定性快照执行。
- [ ] 在 `src/app/canvas/page.tsx` 增加文案选择/刷新控件和节点摘要。
- [ ] 覆盖源文案修改/删除不改变已保存快照的离线测试。

## 4. Batch Scheduler

- [ ] 将 `copy-input` 建模为可选调度角色，拆分必需/可选角色列表并保持旧图校验通过。
- [ ] 扩展批次 filter、内容任务 copy snapshot、规范化和 fingerprint。
- [ ] 在预检/重采样中解析可见文案池，按稳定顺序循环分配并冻结快照。
- [ ] 在最终图构建中注入文案快照；增加绑定类型、路径和空池预检。
- [ ] 扩展调度 UI，支持手选文案与标签 AND 筛选，并显示每个内容任务分配的文案。
- [ ] 更新标准调度骨架，加入文案输入、GPT 标题、GPT 正文和内容组装连接。
- [ ] 验证图片子任务不运行文本链路，最终任务运行两个 GPT 文本节点并生成现有评审草稿。

## 5. Deterministic Verification

- [ ] 新增 `.trellis/verification/copy_library_check.mjs` 并接入 `.trellis/verification/check.ps1`。
- [ ] 扩展 `.trellis/verification/canvas_scheduler_check.mjs`，覆盖兼容、绑定、分配、快照、最终图和骨架。
- [ ] 运行 `node .trellis/verification/copy_library_check.mjs`。
- [ ] 运行 `node .trellis/verification/canvas_scheduler_check.mjs`。
- [ ] 运行 `npm run lint`。
- [ ] 运行 `npx --no-install tsc --noEmit`。
- [ ] 运行 `npm run build`。
- [ ] 运行 `$env:TRELLIS_SMOKE_PORT='45678'; powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`。

## 6. Runtime And Browser Validation

- [ ] 运行 `npm run local:restart` 刷新 `http://127.0.0.1:3001/`。
- [ ] 在 1440x960 验证文案 CRUD/标签/共享、画布选择器、双 GPT 链路和批量配置。
- [ ] 在 390x844 验证无横向溢出、文本不遮挡、表单与调度控件可操作。
- [ ] 浏览器验证使用受控账号/路由拦截或离线桩，禁止真实 GPT、图片、TOS 和飞书写入。

## 7. Completion

- [ ] 复核 diff，确保未覆盖工作区中已有用户修改或做无关格式化。
- [ ] 更新 `.trellis/spec/fluxpost/status.md` 和 `feature_list.json`，仅记录有证据的状态。
- [ ] 仅在形成稳定新规则时更新 architecture/verification/pitfalls/decisions。
- [ ] 运行 `python ./.trellis/scripts/task.py validate 07-28-copy-library-canvas-batch`。
- [ ] 用户确认规划并启动任务后实施；完成时按 Trellis 流程收尾。
