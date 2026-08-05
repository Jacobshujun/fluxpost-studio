# Technical Design

## Contracts

工作流文件使用独立于剪贴板的稳定信封：

```ts
type CanvasWorkflowFileV1 = {
  kind: "fluxpost.canvas.workflow";
  version: 1;
  name: string;
  graph: CanvasGraph;
};
```

剪贴板继续使用 `fluxpost.canvas.nodes` version 1。新增共享 JSON 解码层作为未知载荷的唯一解析边界；剪贴板与工作流文件解析都复用该层，渲染和 API 代码只消费已解码类型。

## Clipboard Flow

复制先创建结构化载荷并写入页面 ref，再尝试写系统剪贴板。键盘 copy/cut 事件同时刷新 ref 和事件 clipboardData。工具栏粘贴先尝试系统剪贴板：读取成功但不是 Canvas 载荷时明确失败；仅 API 不存在、权限拒绝或读取抛错时使用 ref。

实例化片段时生成新 ID并保留内部边。粘贴前以目标图已有角色集合过滤新节点的冲突 `schedulerRole`，再检查合并容量。节点和连线都准备成功后一次性更新 React 状态，避免部分粘贴。

## Workflow File Flow

导出直接读取 `activeWorkflow.name` 与 `currentGraph(nodes, edges, viewport)`，构造最小 version 1 信封并通过 Blob 下载。文件名清除 Windows/URL 非法字符，空结果回退到 `canvas-workflow`。

导入先检查 10 MB 上限并在浏览器解析/升级/校验；成功后向现有创建 API 发送 `{ name, graph }`。服务端 `createCanvasWorkflow` 再次执行升级和 `validateCanvasGraph`，并从当前登录账号设置 owner。客户端只在 201 响应后加入列表并切换新画板。

## Compatibility And Security

- 旧剪贴板载荷没有 `schedulerRole` 时继续有效。
- 已知 version 1 节点可通过现有 registry 升级；未知文件或节点版本拒绝，不猜测映射。
- 文件不接受 owner、ID 或 revision 作为创建身份；即使输入包含额外顶层字段，输出 API 也只使用解析后的 `name` 和 `graph`。
- 媒体 URL、资源 ID 和冻结文本属于节点配置并原样保留；访问权限仍由现有运行时边界检查。
- 不增加数据库迁移、后台任务或外部服务调用。

## Rollout And Rollback

本次为纯前端/图序列化变更。回滚可删除工作流文件模块和工具栏入口，并恢复 clipboard version 1 的旧解析；数据库和已有工作流无需回滚。生产激活失败时使用部署包装器自动恢复上一 release。
