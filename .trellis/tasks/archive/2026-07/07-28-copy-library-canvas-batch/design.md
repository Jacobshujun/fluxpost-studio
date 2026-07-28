# 文案库与画布批量二创技术设计

## 1. Architecture

本功能沿用 FluxPost 的四层边界：

```text
文案库页面 / 画布选择器 / 调度配置
  -> 已登录 API route
  -> copy-library 领域服务 / canvas scheduler
  -> database 双后端适配
  -> PostgreSQL 或 SQLite
```

- 页面只维护表单、筛选、选择和反馈状态。
- API route 负责登录、请求解析和 HTTP 状态映射。
- `src/lib/copy-library.ts` 负责字段规范化、可见性、权限、筛选和 CRUD。
- `src/lib/database.ts` 负责行级持久化，PostgreSQL schema 同步写入 `db/migrations/001_initial_postgres.sql`。
- 画布仍通过中央注册表、共享类型、图校验和执行器运行，不在页面中解释快照。
- 批量调度继续创建不可变 `CanvasGraph` 运行快照，最终结果继续进入现有 `GeneratedPost` 评审路径。

## 2. Domain Contract

新增共享类型 `CopyLibraryEntry`：

```ts
type CopyLibraryEntry = {
  id: string;
  ownerUserId: string;
  ownerDisplayName: string;
  visibility: "private" | "team";
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};
```

API 投影额外返回 `canEdit`，不把权限判断交给浏览器。标题、正文去除首尾空白后必须非空；标签去除首尾空白、大小写不敏感去重、保持首次录入显示形式，并设置明确的单项、数量、标题和正文字数上限。非法数据在领域入口拒绝，不用默认值掩盖。

可见性规则复用图片库：管理员可读写全部；所有者可读写自己的记录；其他成员只可读 `team` 记录。

列表支持：

- 文本搜索：标题、正文、标签。
- 重复 `tag` 参数：AND 语义。
- 可见性筛选。
- 稳定排序：`updatedAt DESC, id DESC`；批量分配另使用 `title ASC, id ASC`，避免编辑时间导致任务映射变化。

## 3. Persistence

新增表 `copy_library_entries`：

- 索引列：`id`, `owner_user_id`, `visibility`, `title`, `created_at`, `updated_at`。
- 完整记录：`data_json`。
- 索引：owner + updated、visibility + updated。

PostgreSQL 与 SQLite schema 必须同步。CRUD 使用行级查询、upsert 和 delete；不读取后全表覆盖。文案为纯文本元数据，不进入 `data/` JSON 文件、TOS 或媒体目录。

## 4. API

- `GET /api/copy-library`: 返回当前账号可见的 `{ entries, tags }`，接受 `q`, 重复 `tag`, `visibility`。
- `POST /api/copy-library`: 创建 `{ entry }`。
- `GET /api/copy-library/[id]`: 返回可见 `{ entry }`。
- `PATCH /api/copy-library/[id]`: 更新标题、正文、标签或可见性，返回 `{ entry }`。
- `DELETE /api/copy-library/[id]`: 权限确认后删除，返回 `{ deleted: true, id }`。

所有 route 使用 `requireWorkspaceAccount(request)`，错误按 400/401/403/404 显式区分；共享文案不可由非所有者修改。

## 5. Copy Library UI

新增 `/copy-library` 工作区及 CSS module，并在现有工作台、图片库和画布可发现入口中加入导航。

桌面采用紧凑的列表与编辑面板布局，移动端切换为单列：

- 工具栏：搜索、标签筛选、可见性筛选、新建。
- 列表项：标题、正文摘要、标签、所有者/共享状态、更新时间。
- 编辑器：标题输入、正文 textarea、标签 combobox/chips、可见性开关、保存和删除命令。
- 他人共享文案为只读，可被查看和画布引用。
- 空状态、加载、保存、错误和删除确认均为可见状态。

标签交互复用图片库的键盘与去重语义，但只实现人工标签，不引入 AI 标签状态、集合或图片预览结构。

## 6. Canvas Node

新增节点类型 `input.copy-library` 和配置字段类型 `copy-library-picker`。

节点配置：

```ts
{
  entryId: string;
  entryTitle: string;
  snapshotTitle: string;
  snapshotBody: string;
  snapshotTags: string[];
  snapshotAt: string;
}
```

节点输出 `title:text` 与 `body:text`。选择器从 API 获取可见文案，选择后一次性写入引用和快照。运行时只读取快照；源记录被修改或删除不会改变已保存工作流。用户重新选择同一记录或点击显式刷新才替换快照。

图校验要求 `entryId`、`snapshotTitle`、`snapshotBody` 和 `snapshotAt` 完整。执行器为确定性 literal executor，不调用数据库或模型。节点摘要显示文案标题与快照时间。

## 7. Batch Scheduler

### 7.1 Optional Role

扩展 `CanvasSchedulerRole` 为可选 `copy-input`。原有五个角色仍是必需角色；`copy-input` 不计入旧工作流缺失校验，从而保持兼容。若批次启用了文案池，预检必须要求：

- `copy-input` 恰好绑定一个 `input.copy-library` 节点。
- 该节点能够到达 `content-target`。
- 每个批次解析出的文案池非空。

### 7.2 Batch Data

`CanvasScheduleBatch` 增加可选 `copyFilter`，包含 `mode: manual | tags`、`entryIds`、`search`、`tags`。旧记录缺失该字段时视为未启用文案输入。

`CanvasScheduleContentTask` 增加可选 `copy` 快照：`id`, `title`, `body`, `tags`, `updatedAt`。预检解析当前可见文案池，按 `title ASC, id ASC` 排序，并按内容任务索引循环分配。预览保存快照及 preview fingerprint；启动仍要求 fingerprint、工作流 revision 和 bindings 未改变。

最终图构建时把 `content.copy` 注入绑定的 `input.copy-library` 节点，然后以 `content-target` 为目标运行。文案查询只发生在预检/重采样阶段；已启动任务不回读文案库。

### 7.3 Standard Skeleton

标准调度骨架新增：

```text
文案库输入.title -> GPT 标题 -> 内容组装.title
文案库输入.body  -> GPT 正文 -> 内容组装.body
图片目标.images              -> 内容组装.images
```

两个 GPT 节点分别带标题改写与正文改写指令，因此每个最终内容任务默认调用两次文本模型。图片阶段以 `image-target` 为目标，不会提前执行文本链路；最终阶段才执行两个 GPT 节点。

## 8. Compatibility And Failure Behavior

- 已保存画布中没有新节点类型时行为不变。
- 旧批量调度记录没有 `copyFilter`/`copy` 时按原链路运行。
- 文案被删除后，普通画布仍使用已有快照；未预检的批量手选若指向已删除/不可见记录则预检失败。
- 共享文案在预检后改为私有或被删除，不影响已经冻结并启动的任务。
- GPT 失败沿用画布 node-run 失败、重试和阻塞规则，不增加静默回退。
- 删除文案是可恢复性较低的操作，UI 必须二次确认，但不级联删除画布或调度历史。

## 9. Verification Design

新增 `.trellis/verification/copy_library_check.mjs`，离线覆盖：

- SQLite/PostgreSQL schema 与行级 database helper。
- 类型、领域 CRUD/权限、团队可见性、标签规范化和 AND 筛选契约。
- API route 登录保护和稳定响应。
- 文案库页面及导航关键契约。
- `input.copy-library` 注册、校验、快照执行和源删除后不回读。

扩展 `canvas_scheduler_check.mjs` 覆盖：

- `copy-input` 可选兼容性。
- 启用文案池时的绑定/空池预检失败。
- 稳定循环分配与内容任务快照。
- 最终图的文案注入、双 GPT 路径和标准骨架。

完成后运行 focused checks、lint、TypeScript、build、完整 Trellis baseline、`npm run local:restart`，并在 1440x960 与 390x844 验证文案库和画布/调度交互。浏览器验证拦截 GPT 等外部请求，不执行付费调用。

## 10. Rollback

代码回滚不删除数据库表，避免破坏已录入文案。新表和新 JSON 字段均为向后兼容增量；旧应用版本会忽略它们。若新调度能力出现问题，可停止使用 `copyFilter` 和 `copy-input`，原五角色调度继续工作。
