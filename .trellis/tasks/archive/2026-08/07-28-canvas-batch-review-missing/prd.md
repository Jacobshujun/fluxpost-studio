# 修复无限画布批量任务内容未进入审查台

## Goal

确保用户已启动的无限画布批量任务在图片子运行完成后，即使应用进程中途重启，也会继续完成内容汇总、持久化当前用户拥有的 `GeneratedPost`，并可在内容审查台看到对应草稿。

## Background

- 2026-07-28 的本地只读 PostgreSQL 检查确认：最新批量调度仍为 `running`，调度快照中的 29 个图片子任务仍为 `running`，但对应 29 条 `canvas_runs` 已为 `completed`。
- 同一时段本地 Node 服务于约 16:20 重启，调度记录最后更新时间早于新进程启动时间。
- `GET /api/canvas/runs` 会唤醒 Canvas 运行队列，`GET /api/canvas/schedules` 会唤醒批量调度协调器；内容审查台只请求 `/api/production/posts`，不会唤醒调度协调器。
- 内容审查台默认 `ready` 筛选包含 `draft`，且已完成的旧批量调度生成稿已正确写入 `generated_posts`，因此本次缺陷不在审查台筛选或所有者过滤。
- 批量内容只有在调度协调器发现图片运行已结束后，才会创建 `phase: "finalize"` 运行；最终 `compose.social-post` 节点负责保存审查稿。

## Requirements

1. Node 服务启动后必须自动唤醒 Canvas 运行队列和批量调度协调器，使持久化的已启动任务无需用户重新打开画布或批量调度抽屉即可继续推进。
2. 同一批量调度中的每个内容任务独立推进；一个内容任务自己的图片子任务全部到达终态且至少产出一张成功图片后，必须立即创建该内容任务的 finalization run 并写入审查稿，不等待同批次或同调度中的其他内容任务完成。
3. Canvas 批量子运行到达终态后必须可靠触发调度协调，缩短图片完成到最终内容汇总之间的窗口。
4. 恢复逻辑只能继续已有运行和调度；不得重复创建已存在的确定性 final run，不得重新提交已有 `providerTaskId` 的付费任务，不得自动发布到飞书。
5. 新生成的审查稿必须保留原调度的 `ownerUserId` / `ownerDisplayName`，并通过现有 `generated-posts` 持久化边界写入。
6. 修复不得依赖审查台请求作为任务推进触发器，也不得通过静默 fallback 掩盖失败。

## Acceptance Criteria

- [ ] 模拟服务重启后，存在已持久化的活动 Canvas 调度时，运行队列和调度协调器会自动启动。
- [ ] 图片子运行已完成而调度快照仍陈旧时，协调器会创建唯一的 finalization run；重复协调不会创建重复运行。
- [ ] 一个内容任务达到可汇总条件后会独立写入审查稿，即使同批其他内容任务仍在运行；首个可汇总任务不被整批完成状态阻塞。
- [ ] finalization 成功后，内容任务记录 `generatedPostId`，调度进入正确终态，生成稿可由当前所有者通过现有 `/api/production/posts` 列出。
- [ ] 已持久化 `providerTaskId` 的运行仍沿用原有恢复逻辑，不新增第二次提交路径。
- [ ] focused Canvas scheduler check、TypeScript、lint、build 和完整 Trellis baseline 通过，且测试过程不调用付费 provider 或飞书写入。

## Out Of Scope

- 修改内容审查台筛选、布局或交互。
- 自动重试已经终态失败的图片/视频 provider 任务。
- 改变批量调度的采样、Prompt、候选图接受或飞书发布规则。
- 清理、改写或删除历史运行数据。
