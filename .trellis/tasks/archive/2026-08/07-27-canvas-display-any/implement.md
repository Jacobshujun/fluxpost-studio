# Canvas 展示任何节点实施清单

## Implementation

- [x] 在 `src/lib/canvas/types.ts` 增加 `CanvasPortKind`、`utility.display-any` 和被动预览定义标记，保持 `CanvasArtifactKind` 不变。
- [x] 在浏览器安全的 Canvas 层集中实现单向端口兼容判断，并让图校验与剪贴板解析统一使用。
- [x] 在 `src/lib/canvas/registry.ts` 注册 `utility.display-any@1` 的单个必填 `value:any` 输入、无输出端口定义和被动终点语义。
- [x] 在 `src/lib/canvas/executors.ts` 注册确定性执行器，严格接收一个输入产物并保存克隆后的 `preview` 运行结果。
- [x] 在 `src/lib/canvas/graph.ts` 和 `src/lib/canvas/runs.ts` 泛化被动预览终点纳入规则，不改变图片预览的既有特殊复用行为。
- [x] 在 `src/app/canvas/page.tsx` 更新普通连线与快速插入兼容判断，并实现五类产物、状态、历史和最近成功结果展示。
- [x] 在 `src/app/globals.css` 增加必要的紧凑结果样式，复用现有文字、图片、视频查看器并保证缩放节点和移动端不溢出。
- [x] 扩展 `.trellis/verification/canvas_workflows_check.mjs`，新增任务级模拟浏览器检查，覆盖设计中的确定性和响应式合同。
- [x] 更新稳定 Canvas 架构事实、功能状态和轻量状态；在证据齐全前不把功能标为 `done`。

## Verification Outcome

- 通过：Canvas 确定性检查、TypeScript、聚焦 ESLint（0 errors）、生产构建、`local:restart`、`/canvas` HTTP 200，以及 1440x960/390x844 模拟浏览器检查。
- 完整 Trellis baseline 通过 lint 前的全部检查，并仅因无关未跟踪文件 `.tmp-canvas-common-nodes-browser-check.cjs:1` 的 `@typescript-eslint/no-require-imports` 错误停止；该用户文件未修改或删除。

## Verification

```powershell
node .trellis/verification/canvas_workflows_check.mjs
npx --no-install tsc --noEmit
npm run lint
npm run build
$env:TRELLIS_SMOKE_PORT='45678'; powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
npm run local:restart
node .trellis/verification/http_smoke.js http://127.0.0.1:3001/canvas
```

运行任务级模拟浏览器检查，在 1440x960 和 390x844 下检查五类预览、状态、兼容快速插入、主题、节点缩放和水平溢出。检查不得调用模型、Seedance、Feishu 或其他外部生产服务。

## Risk And Rollback Points

- `src/lib/canvas/types.ts`：不要把 `any` 加入真实产物联合类型，否则会扩散到执行和 API 合同。
- `src/lib/canvas/graph.ts`、`src/lib/canvas/clipboard.ts`、`src/app/canvas/page.tsx`：三处连接入口必须共用同一单向兼容规则。
- `src/lib/canvas/runs.ts`：只泛化被动终点纳入，不改变现有图片预览复用条件或计费节点规划。
- `src/app/canvas/page.tsx`：当前运行状态不能被最近成功回退遮蔽，媒体控件必须隔离 React Flow 手势。
- `src/app/globals.css`：结果区在最小 `190x120`、最大 `720x900` 和移动端压缩下都必须有明确滚动归属。
