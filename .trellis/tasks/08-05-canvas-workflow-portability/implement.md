# Implementation Plan

- [x] 在 Canvas workflow 确定性检查中先加入剪贴板角色/容量、工作流文件往返与拒绝场景。
- [x] 提取共享未知 JSON 解码器，更新 clipboard version 1 解析与实例化。
- [x] 增加工作流文件创建、解析、文件名和 10 MB 限制。
- [x] 更新 Canvas 页面内存剪贴板、冲突处理、原子容量检查、导出下载和导入创建流程。
- [x] 增加紧凑导入/导出工具栏控件和必要响应式样式。
- [x] 增加 mocked Chromium 跨画板、权限回退、导出和导入回归。
- [x] 运行 workflow/scheduler 专项检查、TypeScript、lint、build、local restart、HTTP smoke 和完整 baseline。
- [x] 更新 FluxPost status、feature evidence 与 architecture rules 中稳定的新事实。
- [ ] 完成生产发布证据写回并归档任务。
- [ ] 提交并推送完整 SHA，运行生产候选验证、只读预检、root-only 备份、部署和发布后检查。

## Validation Commands

```powershell
node .trellis/verification/canvas_workflows_check.mjs
node .trellis/verification/canvas_scheduler_check.mjs
npx --no-install tsc --noEmit
npm run lint
npm run build
npm run local:restart
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

## Rollback Points

- 共享解码器与 workflow-file 模块可在不触碰持久化的情况下回滚。
- 页面导入/导出入口和内存剪贴板回退不改变 API wire shape。
- 生产预检、活动队列、备份或身份不明确时停止，生产保持当前 release。
