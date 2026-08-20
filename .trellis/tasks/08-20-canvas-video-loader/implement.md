# Canvas 视频加载节点实施

## Ordered Work

- [x] 先新增聚焦检查，覆盖类型、注册、literal 输出、上传服务边界、路由鉴权、调度冻结/绑定和 UI 契约，并确认检查在实现前失败。
- [x] 增加视频快照契约、校验助手、上传流式服务与认证 API。
- [x] 注册并执行 `input.video-loader@1`，保持序列化、图校验、复制和历史节点兼容。
- [x] 扩展 V2 调度参数来源、预演冻结、单视频图注入和编辑器默认行为。
- [x] 实现文件选择/XHR 进度、失败重试、队列管理、当前视频预览、桌面拖放创建/追加和响应式样式。
- [x] 运行聚焦检查、TypeScript、lint、build 与完整离线基线，修复全部回归。
- [ ] 更新 FluxPost 状态、功能/验证事实，提交候选，运行 `npm run local` 并验证 3001 版本身份。

## Verification

```powershell
node .trellis/verification/canvas_video_loader_check.mjs
node .trellis/verification/canvas_workflows_check.mjs
node .trellis/verification/canvas_scheduler_check.mjs
npx --no-install tsc --noEmit
npm run lint
npm run build
$env:TRELLIS_SMOKE_PORT = "45678"
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

默认检查不得调用 TOS、Ark、Seedance 或其他外部服务；上传测试使用临时目录、模拟持久化和本地 FFmpeg/FFprobe。

## Risk And Rollback

- 逐层添加联合类型，任何共享调度改动必须证明旧定义仍能归一化。
- 上传失败必须保留错误并清理临时文件，不能用内存缓冲整个 512 MB 文件。
- 不覆盖当前工作树中全局正文长度任务的并行改动；基线入口只做最小追加。
