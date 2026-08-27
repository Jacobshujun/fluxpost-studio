# 修复 Canvas 批量任务跨用户归属

## Goal

当管理员或其他允许的用户启动一个批量调度任务时，后续生成的图片、子任务、汇总任务和审查稿必须归属于实际点击“开始生成”的用户，避免多人共用同一画布时显示错误归属。

## Confirmed Facts

- 现有调度记录只有一个 `ownerUserId`，同时承担任务创建者和生成内容归属两个含义。
- 后台 Canvas run 从工作流/调度 owner 继承身份，审查台忠实显示生成稿保存的 owner。
- 事故样本 `美图复刻-v1.1 批量任务 副本 20260827-102919` 的调度与生成稿均已保存为李琼；原画布 owner 为夏婉珍。

## Requirements

- 调度草稿创建时归创建者；启动后调度访问 owner 与生成内容一起转为实际启动者，避免调度结果向原创建者泄漏。
- 使用 `createdByUserId` / `createdByDisplayName` 永久保留最初创建者，供历史追溯。
- 在首次启动调度时保存实际启动者 `executionOwnerUserId` / `executionOwnerDisplayName`。
- 同一调度的 legacy/V2 共享、图片子任务、汇总和最终内容 run 均使用 execution owner；后台重启、重试和候选图同步不得回退到画布 owner 或创建者。
- 不经过批量调度的普通 Canvas 运行也必须归实际点击运行的账号，而不是画布创建者。
- 生成稿的既有 owner 不得被后续更新改写；旧数据不自动迁移。
- 保持现有管理员跨用户访问能力和普通成员 owner 隔离能力。

## Acceptance Criteria

- [x] 新建调度保存创建者身份，草稿 owner 为创建者。
- [x] 管理员以不同账号启动其他用户可访问的调度后，调度 owner 与 execution owner 均转为启动者，created-by 仍为原创建者。
- [x] legacy 与 V2 的所有新 Canvas run 及最终 `GeneratedPost` 均保存启动者身份。
- [x] 普通 Canvas 单次运行及其最终 `GeneratedPost` 保存实际运行者身份。
- [x] 重试、后台 reconciliation、候选图同步继续使用同一 execution owner。
- [x] 现有 Canvas 调度、账户隔离、TypeScript、lint、构建和完整离线基线通过。

## Out Of Scope

- 不自动修正历史上已经归属错误的生成稿。
- 不改变画布本身的 owner 或普通成员对画布的访问规则。
