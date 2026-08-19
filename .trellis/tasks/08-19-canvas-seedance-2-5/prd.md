# 更新无限画布 Seedance 2.5 节点

## Goal

将无限画布现有的 Dreamina CLI / Seedance 2.0 视频节点迁移为用户提供的火山方舟 Seedance 2.5 接口，使画布能够通过已有 Ark 配置提交、恢复和获取视频生成或编辑任务。

## Background

- 用户提供的 quickstart 实际位于 `D:\ark_seedance2.5_quickstart_package\ark_seedance2.5_quickstart_package`。
- quickstart 使用 `volcengine-python-sdk[ark]` 的 `content_generation.tasks.create/get`，默认模型为 `doubao-seedance-2-5-260628`。
- 官方 SDK 对应 REST 契约为 `POST /contents/generations/tasks` 和 `GET /contents/generations/tasks/{task_id}`，使用 `Authorization: Bearer <ARK_API_KEY>`。
- 当前 `model.seedance` 节点通过 `dreamina` CLI 提交 Seedance 2.0，并在运行前查询 Dreamina 积分；项目已经具有 `ARK_BASE_URL` 和 `ARK_API_KEY` 配置。

## Requirements

- R1. `model.seedance` 改为通过 Ark Content Generation API 调用 Seedance 2.5，不再依赖 Dreamina CLI、Dreamina 登录或积分查询。
- R2. 请求支持现有文字、参考图片和参考视频输入；素材分别编码为 `text`、`reference_image` 和 `reference_video` content 项。
- R3. 节点继续支持时长、比例和分辨率，并新增 quickstart 明确使用的生成音频与水印开关。
- R4. 默认模型使用 `doubao-seedance-2-5-260628`，同时允许通过高级配置改为已开通的模型 ID 或 Endpoint ID。
- R5. 异步任务 ID 必须继续写入 Canvas node run；后续 worker 恢复时只查询原 Ark task，不重复提交。
- R6. 缺少 Ark API Key、HTTP 错误、失败任务、无任务 ID、成功但无视频 URL 等情况必须返回明确错误；日志和错误不得暴露密钥。
- R7. 保持现有 `model.seedance` 类型和 `version: 1` 可读取，已有画布不因节点版本变化而无法加载；旧 Dreamina 字段不再控制执行。
- R8. 参考素材必须是 Ark 可访问的 HTTP(S) URL，并保留当前保守的提示词、时长、比例、分辨率和素材数量校验。
- R9. 默认验证不得调用 Ark、Seedance 或其他付费外部服务。

## Acceptance Criteria

- [x] AC1. 新建 Seedance 节点显示 Seedance 2.5/Ark 语义，并提供时长、比例、分辨率、生成音频、水印和合规风险设置。
- [x] AC2. 确定性测试证明创建请求使用正确的 Ark URL、Bearer 认证、模型、content roles 和节点参数。
- [x] AC3. 确定性测试证明查询请求复用既有 task ID，并正确归一化 queued/running/succeeded/failed 状态及视频 URL。
- [x] AC4. 缺少 `ARK_API_KEY` 时运行前检查显示 `needs_config`，不发出网络请求。
- [x] AC5. 已保存的 `model.seedance` version 1 图仍可解码；旧配置可加载且执行时使用新的 Ark 配置。
- [x] AC6. Canvas 聚焦检查、lint、TypeScript、build 和 Trellis 基线全部通过，且无真实 Seedance 调用。

## Out Of Scope

- 不在本任务中添加参考音频输入端口、回调 webhook、取消/删除 Ark task、草稿任务或 Seedance 2.5 专属提示词生成器。
- 不执行真实付费生成、生产部署、生产配置修改或历史运行数据迁移。
- 不保留 Dreamina 作为第二个可选 provider；本次是现有 Seedance 节点的 Ark 迁移。
