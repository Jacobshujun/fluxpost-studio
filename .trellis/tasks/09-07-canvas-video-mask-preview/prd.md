# Fix Canvas video mask preview

## Goal

让 Canvas 的视频遮罩工作流在任务成功后显示并可打开生成的视频预览。

## Requirements

- 保持图片、文本和现有单输出节点的预览行为不变。
- 对同时声明图片与视频输出、但本次运行只返回视频 artifact 的节点，选择实际存在且非空的视频 artifact。
- 不改变遮罩执行器、媒体缓存 URL 或运行数据结构。
- 增加确定性的回归检查，覆盖视频遮罩只产生视频输出的情况。

## Acceptance Criteria

- [x] 成功的视频遮罩运行在节点结果区显示视频结果，并可打开现有视频预览对话框。
- [x] 图片遮罩、文本结果和空结果状态仍按现有逻辑渲染。
- [x] 遮罩专项检查和完整离线基线通过。
- [x] 工作树只包含本修复相关变更，且修复已提交。

## Confirmed Evidence

- `src/lib/canvas/registry.ts` declares `utility.media-mask` outputs in image-then-video order.
- `src/lib/canvas/executors.ts` returns only the connected media kind; video-only runs return `outputs.videos`.
- `src/app/canvas/page.tsx` currently derives one expected output kind from the first output port, causing successful video-only mask runs to render as empty.
