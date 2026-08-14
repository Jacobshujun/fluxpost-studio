# Technical Design

## Architecture

- `CanvasNodeType` 增加 `utility.save-images`，Registry 定义为 `passiveSink`、无 outputs、无 bypass；执行器把输入深拷贝到内部 `outputs.downloads` 图片 Artifact。
- 下载领域逻辑放在 `src/lib/canvas/image-download.ts`：校验前缀、从 owner-scoped `CanvasRunWithNodes` 解析节点运行/图片、生成序号文件名和安全响应头。
- `GET /api/canvas/runs/[id]/downloads/images` 只接收 `nodeRunId` 和零基 `index`。Route 认证后调用现有 `getCanvasRun`，再物化已持久化的图片引用并返回流。
- 页面新增保存节点专用结果组件。客户端按序 `fetch` 每张图片、解析 `Content-Disposition`、用 Blob 链接触发下载并释放 URL。

## Contracts

- Node config: `{ filenamePrefix: string }`, default `FluxPost`.
- Hidden run output: `{ downloads: { kind: "images", items: CanvasMediaReference[] } }`；不加入连接端口，也不改变 `CanvasArtifactKind`。
- Download request: `GET /api/canvas/runs/:runId/downloads/images?nodeRunId=<id>&index=<zero-based>`.
- Success: image bytes plus `Content-Type`, `Content-Length`, `Content-Disposition: attachment`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`.
- Errors: 401 unsigned; 404 inaccessible/missing run or node result; 400 malformed id/index, unsuccessful result, bad prefix, out-of-range item, oversized/non-image media.

## Data Flow And Safety

1. Canvas worker resolves upstream images and persists a cloned `downloads` Artifact.
2. UI selects current or historical successful `CanvasNodeRun` and requests one image index at a time.
3. Server re-reads the owner-visible run, verifies node type/snapshot/output, and ignores all caller-controlled URLs/names.
4. Runtime media materializer handles app-local, TOS and HTTP(S) references with a 30 MB limit.
5. File signature selects the real extension. A Node read stream serves bytes; close/error/cancel triggers materializer cleanup.

Prefix validation is shared by Registry and download resolution. It accepts Unicode but rejects empty/over-80 values, C0/C1 controls, `< > : " / \\ | ? *`, and trailing space/dot. The server always appends a four-digit ordinal, so callers never control an extension or directory.

## Compatibility And Rollout

- Existing graph decoding remains valid because the new type is additive. No saved graph upgrade or database migration is required.
- Background/batch execution records downloadable results but cannot write to a user's computer; later interactive download uses the same persisted node run.
- Candidate work occurs only in the isolated worktree based on fresh `origin/main`. Deployment uses the repository fixed-SHA verifier and wrapper, preserving all volumes and rollback release.
