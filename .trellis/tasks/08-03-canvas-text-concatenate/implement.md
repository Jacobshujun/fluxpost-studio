# Implementation Plan

1. 读取 `trellis-before-dev` 指定的 frontend 与 fluxpost 规范，确认任务仍处于已批准范围。
2. 在 `src/lib/canvas/types.ts` 增加 `utility.text-concatenate` 类型，并在 `src/lib/canvas/registry.ts` 注册 v1 节点、四个可选文本端口、一个文本输出、中文标签和 WAS 默认配置。
3. 在 `src/lib/canvas/node-utils.ts` 实现可独立验证的 WAS 兼容文本拼接函数；在 `src/lib/canvas/executors.ts` 注册 executor 并完成 artifact 转换。
4. 在 `src/app/canvas/page.tsx` 增加节点图标映射、节点内分隔符/复选框控件和文本结果预览接入；在 `src/app/globals.css` 添加紧凑、稳定、响应式样式。
5. 扩展 `.trellis/verification/canvas_workflows_check.mjs` 的节点合同、图/剪贴板往返、执行边界与 UI 静态断言。
6. 运行聚焦 Canvas check、`npx --no-install tsc --noEmit`、变更文件 ESLint 和 `npm run build`；修复本任务导致的全部失败。
7. 运行 `npm run local:restart` 刷新 `http://127.0.0.1:3001/`，执行本地 HTTP smoke，并使用项目现有浏览器测试方式检查桌面与移动端的创建、配置、连线、保存/重载和运行结果。
8. 读取 `.trellis/spec/fluxpost/verification.md` 并运行规定的全量 baseline；执行最终 diff、秘密/运行数据/无关文件审计。
9. 按 Completion Protocol 更新 `status.md`、`feature_list.json` 和必要任务证据，使用 `trellis-check` 与 `trellis-update-spec` 完成质量门禁。
10. 只暂存本任务文件并提交；推送 `release/production-20260803`，通过 `git ls-remote` 确认远端完整 SHA。
11. 对完整 SHA 运行生产 38 candidate verifier、只读 preflight、活动队列门禁和 root-only PostgreSQL 备份；任一状态不健康或不明确则停止。
12. 运行安装的 wrapper check 与固定 SHA 部署；完成 post-deploy identity、健康、路由、认证边界、schema、worker、服务和 volume 检查。失败则回滚并验证恢复。
13. 记录经确认的生产 release/SHA/验证事实，提交并推送必要的部署记录，归档 Trellis task。

## Validation Commands

```powershell
node .trellis/verification/canvas_workflows_check.mjs
npx --no-install tsc --noEmit
npx --no-install eslint src/lib/canvas/types.ts src/lib/canvas/registry.ts src/lib/canvas/node-utils.ts src/lib/canvas/executors.ts src/app/canvas/page.tsx
npm run build
npm run local:restart
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
git diff --check
git status --short
git ls-remote origin refs/heads/release/production-20260803
```

生产端使用现有入口：

```bash
/opt/fluxpost-studio/bin/verify-candidate.sh --check --ref <full-sha>
/opt/fluxpost-studio/bin/verify-candidate.sh --ref <full-sha>
/opt/fluxpost-studio/bin/deploy.sh --check --ref <full-sha>
/opt/fluxpost-studio/bin/deploy.sh --ref <full-sha>
```

## Risk And Stop Conditions

- 节点字段、端口 ID 或执行顺序与本 PRD 的 WAS 对齐语义不一致。
- 聚焦检查、类型、lint、build、本地页面或全量 baseline 失败。
- diff 包含秘密、环境文件、运行数据、生成媒体、调试产物、无关截图或非任务代码。
- GitHub 远端 SHA 与候选 SHA 不一致，或候选 verifier 没有 commit-bound passing manifest。
- 生产 host identity、当前 release、健康、磁盘、命名卷、活动任务、备份或受保护服务状态不健康或不明确。
- 部署需要 bootstrap、删除/替换 volumes、全局 Docker 操作、DNS/Nginx/firewall 修改或临时改生产源码。

## Rollback Points

- 提交前：只撤销本任务明确拥有的改动，不触碰用户已有提交和无关未跟踪文件。
- 部署前：任何门禁失败都停止，生产保持不变。
- 部署后：使用 `/opt/fluxpost-studio/bin/deploy.sh --rollback <captured-release-id>` 恢复，并复验原 manifest/image、应用/PostgreSQL、Nginx/HTTPS、Open WebUI 与 volumes。
