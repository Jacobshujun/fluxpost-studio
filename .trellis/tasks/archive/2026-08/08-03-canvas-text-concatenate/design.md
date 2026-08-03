# Technical Design

## Scope And Boundaries

新增 `utility.text-concatenate` Canvas v1 节点，不增加 API 路由、数据库表、迁移、后台 worker、provider capability 或外部写入。现有 Canvas workflow graph 会按已有 JSON 合约自然持久化该节点；类型注册表仍是节点定义的唯一来源。

## Node Contract

- 类型：`utility.text-concatenate`
- 版本：`1`
- 类别：`utility`
- 中文标签：`文本拼接`
- 输入：`text_a`、`text_b`、`text_c`、`text_d`，均为可选、单连接的 `text` 端口，显示为“文本 A”至“文本 D”。
- 输出：`text`，类型为 `text`，显示为“文字”。
- 配置：`delimiter: string` 与 `clean_whitespace: boolean`。
- 默认值：沿用 WAS 原实现，`delimiter` 为 `", "`，`clean_whitespace` 为 `false`。
- 不提供 bypass 映射：四个输入之间没有无歧义的旁路目标；现有 disabled 模式仍可使用。
- 不声明 capability：运行不需要付费确认或外部服务。

## Execution Semantics

执行器按固定端口序列读取每个端口唯一的 `text` artifact：

1. 缺失端口视为没有输入。
2. `delimiter` 等于实际单个换行或字面量 `\\n` 时规范化为单个换行；其他值原样使用。
3. `clean_whitespace=true` 时对每路字符串执行 `trim()`；关闭时保留输入原样。
4. 清理后等于空字符串的输入被忽略；关闭清理时纯空白字符串保留。
5. 有效字符串按 A、B、C、D 顺序用分隔符连接。
6. 没有有效字符串时成功输出 `{ kind: "text", value: "" }`。

纯字符串拼接逻辑放入现有 `src/lib/canvas/node-utils.ts`，执行器只负责 artifact 边界转换，避免 UI、测试和运行层重复定义语义。

## UI Design

- 注册表自动让节点出现在左侧“工具”节点库和 ComfyUI 风格快速添加搜索中，并参与类型兼容筛选。
- 节点卡片内增加紧凑控件：单行分隔符输入和布尔复选框，复用现有 `nodrag nopan nowheel` 交互隔离与节点聚焦模式。
- 配置侧栏继续由注册表字段通用渲染，节点内控件和侧栏写入同一 `node.config`，不增加第二份状态。
- 文本结果复用现有 Canvas node result/预览组件，使当前运行与最近成功结果可检查。
- 使用 `lucide-react` 的现有图标，不增加自绘 SVG；样式加入 `src/app/globals.css` 的 Canvas 区域并覆盖窄屏/缩放下的稳定尺寸。

## Compatibility And Persistence

- 节点为全新 v1 类型，不需要旧节点升级逻辑或数据库迁移。
- `CanvasNodeType`、注册表、executor record 和图/剪贴板验证共用同一类型合同；保存、加载、复制和粘贴沿用现有通用路径。
- 所有内部字段保持 WAS 命名，界面只做中文显示标签。

## Verification Design

- 扩展 `.trellis/verification/canvas_workflows_check.mjs`：节点总表、端口/默认配置、图兼容、剪贴板往返、执行顺序、空输入、普通分隔符、换行转义、清理开关和纯空白边界。
- 扩展 Canvas UI 静态断言，确认节点内控件、结果预览和交互隔离存在。
- 运行聚焦 Canvas check、TypeScript、相关 ESLint、production build、本地 production restart、全量 Trellis baseline，以及桌面/移动端浏览器检查。
- 所有自动化都使用本地确定性输入，不调用 provider 或写入外部系统。

## Release And Rollback

- 在当前 `release/production-20260803` 上提交任务相关文件；保留分支已有 3 个本地提交作为提交祖先，不改动无关未跟踪截图。
- 推送后校验 GitHub 远端分支解析到本次完整 SHA。
- 生产 38 先运行 commit-bound candidate verifier、只读健康/活动队列/磁盘/卷 preflight 和 root-only PostgreSQL 备份，再运行 `/opt/fluxpost-studio/bin/deploy.sh --check --ref <sha>` 与 `--ref <sha>`。
- post-check 验证 manifest/image/container SHA、应用/PostgreSQL、Nginx/HTTPS、Canvas 路由与未认证 API 边界、worker、schema、Open WebUI、六个命名卷和保留的上一 release。
- 任一强制 post-check 失败时，用捕获的 release id 执行 manifest-aware rollback；禁止删除 volume、全局 prune、临时改生产源码或暴露环境值。
