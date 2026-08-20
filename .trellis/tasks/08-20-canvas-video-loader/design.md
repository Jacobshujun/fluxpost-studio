# Canvas 视频加载节点设计

## Architecture

新增共享 `CanvasVideoSnapshot` 契约及其校验/配置解析助手。`input.video-loader@1` 仍使用现有 `videos` artifact 和普通 literal executor，避免为输入节点建立新的运行队列。页面只管理上传 UI 和节点配置，文件验证、探测、哈希和持久化位于独立服务模块，API 路由仅处理鉴权、文件名和响应映射。

## Upload Data Flow

浏览器通过 XHR 将每个文件作为原始请求体顺序发送。服务端将 Web `ReadableStream` 分块写入唯一临时文件，同时累计真实字节数和 SHA-256；超过 512 MB 立即中止。写完后用现有 FFprobe 边界读取媒体元数据，要求一个视频流且容器属于 MP4/MOV/WebM。以哈希构造 `/generated/canvas-video-uploads/<hash>.<ext>`，原子移动到稳定路径，再交给 `persistRuntimeMedia`；所有异常清理临时路径。

响应为完整 `CanvasVideoSnapshot`。稳定 id 使用内容哈希，重复内容不复制节点项；底层稳定对象允许跨画布引用。节点移除不触发存储删除。

## Node And UI

节点配置键为 `videos: CanvasVideoSnapshot[]` 与 `selectedVideoId: string`。通用 `CanvasNodeConfig` 扩展为允许结构化视频快照数组，页面配置回调对该节点使用整块 patch。普通输出从解析后的队列中查找当前项并构造一条 `CanvasMediaReference`。

检查器维护页面级上传任务状态 `{id, file, progress, status, error}`，避免把瞬时进度写入工作流。上传成功后立即追加节点配置；失败项保留在检查器会话中供重试。节点列表使用单选、文件摘要、上移/下移、预览、移除等紧凑操作。拖放根据 DOM 命中决定追加或在指针 Flow 坐标创建节点。

## Scheduler

V2 增加 `video` 参数值类型（值为 `CanvasVideoSnapshot`）、`video-loader-queue` 参数来源（记录 `nodeId`）与 `video-input` adapter。预演从当前冻结工作流图中解析指定节点队列并转为 manual-list 快照，不读取可变数据库记录。应用参数时将目标加载节点配置替换为单项队列并选中该项。

定义校验要求来源节点存在、类型正确、队列非空且不超过 200；绑定字段必须仍兼容 `video`。预演完成后参数来源和值都保存在调度定义/任务快照中，启动不重新读取画布节点。

## Compatibility And Failure

- 新节点类型和新调度联合类型均为加法；旧节点版本和旧调度定义保持可读。
- 512 MB 只在上传和已有下游 materializer 处约束；视频时长和音轨要求仍由具体下游节点决定。
- TOS 启用时需要完整配置；未启用时保留本地公开路径。上传错误不产生成功快照。
- 不信任文件名、扩展名、Content-Type 或 Content-Length；唯一权威是流式字节计数和 FFprobe 结果。
