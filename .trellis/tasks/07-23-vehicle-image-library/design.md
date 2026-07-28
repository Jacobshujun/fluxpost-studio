# Design

## Architecture

- 保留现有 `LibraryAsset`、`library_asset_roles`、`LibraryCollection` 和对象存储模型；车型图库是同一领域模型的角色视图，不新增平行资产表。
- `src/lib/library-tags.ts` 提供唯一的按角色标签投影：`reference` 使用现有 `effectiveTags`，`vehicle` 从 `manualOverrides` 构造纯人工标签 profile。前后端展示、搜索、建议和筛选共同使用该语义，避免局部分支不一致。
- `src/lib/library-assets.ts` 负责角色感知的列表、搜索、标签建议、人工标签变更、导入去重和角色转换；路由保持鉴权、解析和响应职责。
- `src/lib/library-tagging.ts` 把 `reference` 角色作为所有入队和执行的硬前置条件，保证车型角色不能通过直接 API、遗留队列或竞态触发模型。
- `/library` 保留一个客户端工作台；`?role=reference|vehicle` 是可分享的视图状态，页签切换写入浏览器历史并响应前进后退。

## Data Flow

### Vehicle import

1. 浏览器以 `role=vehicle` 提交现有 multipart 导入接口。
2. 服务端完成鉴权、文件头、大小、哈希和 TOS 验证。
3. 新图片保存为纯车型资产，使用空 AI profile 和中性完成状态，但不创建 `library_tagging_jobs`。
4. 同用户哈希重复且尚无车型角色时，复用对象并补充 `vehicle` 角色及目标集合；已有车型角色时返回普通重复结果。
5. 前端显示“已导入车型图库”，刷新车型列表，不启动打标状态轮询。

### Reference eligibility

1. `reference` 导入继续原子保存资产与打标任务。
2. 纯车型资产新增 `reference` 角色时，资产状态切为 `queued` 并原子保存新的参考图打标任务；调用该变更的路由负责唤醒 worker。
3. 手工重新打标接口只接受仍含 `reference` 角色的资产。
4. worker 在模型调用前以及结果写回前再次读取资产并检查 `reference` 角色；不满足时结束任务且不调用模型或覆盖标签。

### Manual vehicle tags

1. 车型 UI 在单图或批量请求中明确发送 `role=vehicle`。
2. 服务端以纯人工 profile 计算新增/删除结果；新自由标签继续存入现有 `manualOverrides.customTags`。
3. 车型列表搜索、重复 `tag` 参数的 AND 筛选和标签建议均使用纯人工 profile。
4. API 返回资产后，UI 仍通过同一按角色投影 helper 渲染，避免更新后的瞬间泄露 AI 标签。

## Contracts

- 有效图库角色仍为 `reference | vehicle`，不新增数据库枚举或迁移表。
- `GET /api/library/assets?role=vehicle` 的搜索和标签筛选仅针对人工 profile；`role=reference` 保持现状。
- `GET /api/library/tags?role=vehicle` 只返回当前账号可见车型资产的人工标签建议。
- `POST /api/library/tags` 增加必需的当前 `role` 语义；图库页面始终显式提交，服务端验证角色和资产归属。
- `LibraryAsset.taggingStatus` 继续复用现有状态类型。纯车型新资产内部保存为 `completed`，但车型 UI 完全不展示该字段；“没有任务记录”而不是状态文字，才是“不使用 AI”的权威证据。
- 车型历史 `aiTags` 保留在 canonical asset 中，仅被车型投影排除；参考图双重归属仍可使用这些数据。

## UI Design

- 视觉方向延续现有安静、紧凑的资产工作台，不创建第二套页面或装饰性卡片。
- 页签命名统一为“参考图库 / 车型图库”；标题、副标题、计数、空状态和导入标题随角色变化。
- 车型筛选栏保留搜索、人工标签和共享范围，删除打标状态与失败重试。
- 车型批量栏保留标签、共享范围、移出和删除，删除重新打标。
- 车型卡片隐藏打标徽标；详情和预览中的标签控件只显示人工标签并隐藏“恢复 AI 标签”。
- 主工作台使用现有 `HeaderLink` 新增车型图库直达入口，不引入新的导航组件。

## Compatibility And Migration

- 不执行 schema 迁移，不清理历史资产、集合、角色或对象。
- 历史纯车型排队任务被 worker 的角色门禁安全结束，不再调用 AI。
- 参考图库默认路由、AI 队列、统一标签和人工覆盖合同保持不变。
- 现有同图库 SHA-256 重复语义保持；仅新增“重复对象补充另一个图库角色”的跨角色分支。

## Risks And Rollback

- 最大风险是角色视图间标签泄漏。所有标签读取必须经过一个共享投影 helper，并由静态专项检查覆盖 UI 与服务端调用点。
- 最大竞态是参考角色在模型调用期间被移除。worker 必须在调用前和写回前双检角色。
- 跨角色重复导入会修改已有资产角色；仅允许所有者或管理员编辑，并复用现有集合校验。
- 回滚时可恢复车型页签旧 UI 和导入入队分支；没有 schema 或破坏性数据迁移需要回退。
