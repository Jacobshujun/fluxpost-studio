# 修复画布批量调度子任务状态误判

## Goal

TBD.

## Requirements

- TBD

## Acceptance Criteria

- [ ] TBD

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
# 修复画布批量调度子任务状态误判

## Goal

批量调度子任务必须依据其绑定的目标节点是否产生了合法结果来显示状态，避免上游节点成功但目标图片失败时错误显示“部分完成”或“已完成”。

## Requirements

- 覆盖 V1 图片任务、V2 子任务和 V2 共享阶段。
- `completed`/`partial` 只有在目标输出存在且类型正确时才可保留。
- 缺少目标输出时改判为 `failed`，保留真实运行错误；无错误时使用明确的目标输出缺失信息。
- 顶层批量任务继续允许在成功/失败混合时显示 `partial`。
- 不修改底层 CanvasRun 状态、数据库结构或 ToAPIs 协议。
- 历史任务通过读取/轮询时的调度器重算自动纠正，不做批量迁移。

## Acceptance Criteria

1. 上游成功、目标图片失败且 CanvasRun 为 `partial` 时，V1/V2 子任务显示 `failed`。
2. `completed` 但目标输出为空或类型不符时，子任务显示 `failed`。
3. `partial` 且目标输出存在时，子任务显示 `partial`。
4. 共享阶段缺少任一声明输出时显示 `failed`，并保留错误详情。
5. 混合成功/失败的顶层批量任务显示 `partial`。
6. 失败任务的现有重试入口继续可用。
7. 聚焦检查、TypeScript、lint、build 和完整离线基线通过，且不调用外部生产服务。

## Out Of Scope

- ToAPIs 请求、轮询和错误协议调整。
- 数据库迁移或历史运行记录批量重写。
- 改变 CanvasRun 的底层状态语义。
