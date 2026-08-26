# 执行计划

## 1. 建立证据表

- [x] 记录默认启动文件字节数、活动任务数、重名/孤立目录。
- [x] 对每个活动任务核对 task notes、PRD 验收项、Git 提交和归档记录。
- [x] 生成保留、归档、删除重复副本三类清单。

## 2. 清理任务状态

- [x] 删除已有完整归档副本的活动重复目录。
- [x] 归档有充分完成或替代证据的任务。
- [x] 对保留任务写入简短、当前、可执行的 `待确认`/剩余验收说明。
- [x] 消除孤立目录和失效父子引用。

## 3. 校准并精简规范

- [x] 修正项目路径、handoff/progress 规则、直接部署流程和当前状态。
- [x] 更新 handoff/progress 最新块，移除已完成工作的假待办。
- [x] 压缩 `feature_list.json` 证据和备注，保持状态与详细归档链接。
- [x] 仅在稳定事实发生变化时修正 decisions/architecture/verification。

## 4. 验证

- [x] `python ./.trellis/scripts/task.py validate 08-26-clean-trellis-state`
- [x] `python ./.trellis/scripts/get_context.py`
- [x] 统计默认启动文件合计 <= 35 KB。
- [x] 搜索同名活动/归档任务、过期 82/104 当前前置条件及相互冲突规则。
- [x] `$env:TRELLIS_SMOKE_PORT = "45678"; powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`
- [x] 检查最终 Git diff 只包含本任务范围。

## Risk Gates

- 删除活动重复目录前，必须验证同名归档目录含完整 `task.json` 和规划文件。
- 不确定任务不得归档。
- 若完整基线暴露与本次无关的现有失败，保留原始失败证据，不弱化检查。
