# Canvas 文本分割节点实施清单

## Implementation

- [x] 注册 `utility.text-split@2`，保留 V1，添加配置校验与编辑图升级。
- [x] 扩展纯文本分割和执行器，保留 V1 严格语义并实现 V2 第 N 个边界及正文降级。
- [x] 添加节点内配置、属性面板条件字段、双结果预览与响应式样式。
- [x] 扩展 Canvas 确定性检查，覆盖版本、升级、执行、降级、边界、UI 合同与往返兼容。
- [x] 更新稳定 Canvas 架构契约、状态和功能证据；功能状态保持 `ready_for_review`。

## Verification

```powershell
node .trellis/verification/canvas_workflows_check.mjs
npx --no-install tsc --noEmit
npm run lint
npm run build
$env:TRELLIS_SMOKE_PORT=45678; powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
npm run local:restart
node .trellis/verification/http_smoke.js http://127.0.0.1:3001/canvas
```

使用现有 Canvas 模拟 API 方法在 1440x960 和 390x844 检查配置同步、双输出、降级提示和水平溢出。检查不得调用外部付费服务。

## Risk Points

- 执行器必须按节点版本分支，不能改变 V1 不可变快照语义。
- V2 保持 `head`/`tail` 端口 ID，避免已有边和剪贴板失效。
- 降级时省略标题 Artifact，不能输出空标题文本。
- 工作区已有大量用户改动；只合并目标文件，不清理或覆盖无关内容。
