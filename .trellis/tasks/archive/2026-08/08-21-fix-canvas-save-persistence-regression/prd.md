# 修复 Canvas 工作流保存复发

## Goal

修复本地 `/canvas` 编辑后无法可靠持久化的问题，确保用户在保存完成后刷新页面仍能看到刚才保存的工作流名称、节点、连线、节点配置和视口。

## Background

- 用户在 2026-08-21 明确报告：无限画布无法保存工作流，刷新后恢复成之前的工作流。
- 当前 clean port-3001 candidate 为 `8bdf4aca400ecdb99c90c7212accba9cabc6ebb9`，已包含 `072cce5` 的前端保存串行化修复，因此不是旧版本监听器。
- 现有 `canvas_save_race_browser_check.py` 使用 mocked workflow API，只覆盖名称输入和延迟 PATCH；它没有证明节点编辑经过真实 API 写入 PostgreSQL 后可被刷新回读。
- 本地 PostgreSQL 中 10 个 Canvas 工作流均能通过当前 graph upgrade 和 validation，故不存在已确认的旧图整体校验失败。
- 最近工作流 revision 仍在增长，说明问题不是所有 PATCH 都完全停止；必须区分错误快照、静默跳过、冲突和写后回读不一致。

## Requirements

- 手动保存必须捕获点击时最新的工作流名称、节点、连线、节点配置和视口，不得仅持久化上一次 React render 的快照。
- 自动保存、手动保存、运行前保存及其他会更新工作流 revision 的路径必须遵守同一 revision/dirty-state 契约，不能静默丢弃保存意图或用旧响应覆盖新编辑。
- 保存成功的反馈只能在服务端已接受对应图快照后出现；保存失败必须保留 dirty 状态并显示明确错误。
- 刷新回读必须与最后一次确认保存的图一致，包括真实 PostgreSQL backend。
- 保持 owner scope、服务端乐观锁、900 ms 自动保存策略和现有工作流 API/schema，不增加轮询、静默重试或弱化校验。
- 不读取、记录或提交工作流正文、媒体、凭据、会话 token 或其他本地用户数据。

## Acceptance Criteria

- [x] 浏览器编辑节点配置并立即手动保存时，PATCH body 包含最新配置而不是前一 render 的值。
- [x] 节点移动、连线、删除、名称和视口修改均能在保存后通过工作流 GET/刷新回读。
- [x] 保存期间出现后续编辑时请求仍保持最大并发一，并用前一响应 revision 串行保存最新图。
- [x] 任何被全局 busy 或 revision 冲突阻止的保存都不会显示“画布已保存”或清除 dirty。
- [x] 增加不依赖外部服务、不会保留用户数据的真实 persistence 回归检查，覆盖写入与回读一致性并清理测试记录。
- [x] Canvas focused checks、mocked browser checks、TypeScript、lint、build 和完整离线 baseline 通过。
- [x] 修复提交后由 `npm run local` 激活，`/api/version` 与 clean HEAD 一致，`/canvas` 返回 200。

## Out Of Scope

- 跨标签页自动合并、离线编辑、工作流 schema 迁移、生产部署或外部 provider/Feishu 调用。
